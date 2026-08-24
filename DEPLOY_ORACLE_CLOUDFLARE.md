# Oracle Cloud + Cloudflare TM 배포 절차 (보안 중심)

> **스냅샷 기준일:** 2026-08-24  
> **대상 호스트:** `https://tm.tsutaai.com`  
> **예시 퍼블릭 IP:** `217.142.243.78` (문서 예시용; 환경에 맞게 교체)  
> **원칙:** 시크릿·프라이빗 키는 커밋·채팅·이 문서에 절대 넣지 않는다.

---

## 1. 원칙 (Principles)

| 원칙 | 설명 |
|------|------|
| **시크릿 비커밋** | `.env`, API 키, 인증서 프라이빗 키, SSH 프라이빗 키를 Git에 올리지 않는다. `.gitignore`에 이미 포함되었는지 배포 전에 확인한다. |
| **채팅에 프라이빗 키 금지** | SSH/SSL 프라이빗 키 내용을 채팅·이슈·PR·로그에 붙여 넣지 않는다. 유출 시 즉시 키를 폐기하고 재발급한다. |
| **TsutaAI와 분리** | 기존 TsutaAI(포트·nginx vhost·pm2 프로세스·디렉터리)를 건드리지 않는다. TM은 별도 디렉터리·포트·pm2 이름만 사용한다. |
| **최소 방화벽** | 공개는 가능하면 **80/443만**. 앱 포트(8088)는 localhost 또는 필요 시만 제한 공개. |
| **Cloudflare SSL 모드 이해** | 아래 표 참고. **Flexible는 오리진 HTTP만 쓰므로 Full/Full (strict)와 혼동하면 525/526·리다이렉트 루프가 난다.** |

### Cloudflare SSL/TLS 모드

| 모드 | 브라우저 ↔ CF | CF ↔ 오리진 | 비고 |
|------|---------------|-------------|------|
| **Flexible** | HTTPS | HTTP (80) | 오리진에 TLS 불필요. 보안상 비권장. Full로 바꾸면 오리진 443이 필요해진다. |
| **Full** | HTTPS | HTTPS (인증서 검증 느슨) | 자가서명·만료·호스트명 불일치도 통과하는 경우가 많음. **현재 스냅샷에서 사용 중일 수 있음.** |
| **Full (strict)** | HTTPS | HTTPS (유효한 인증서 필수) | Origin CA 또는 공인 CA(Let's Encrypt 등) 권장. |

**주의:** CF가 **Full**인데 nginx가 **80만 listen**하면, CF→오리진 HTTPS(443)가 **기존(다른) vhost**로 들어가 TM이 아닌 사이트가 보인다. 반드시 TM용 **443 서버 블록**을 추가한다.

---

## 2. SSH 배포 키 (ed25519)

서버(`ubuntu`)에 배포용 키만 추가하고, **프라이빗 키는 로컬/시크릿 저장소에만** 둔다.

로컬에서 ed25519 키 쌍을 생성한다. 파일 예: `~/.ssh/tm_deploy_ed25519` (비공개), `~/.ssh/tm_deploy_ed25519.pub` (공개).
코멘트 예: `tm-deploy@YYYYMMDD`. 패스프레이즈는 운영 정책에 따른다.

퍼블릭 키만 확인한 뒤, 서버 ubuntu 사용자의 `~/.ssh/authorized_keys`에 **한 줄 append**한다.
`~/.ssh`는 700, `authorized_keys`는 600.

### 금지 사항

- 프라이빗 키 파일을 리포·채팅·이 문서에 넣지 말 것
- 기존 TsutaAI/다른 서비스용 키를 덮어쓰거나 삭제하지 말 것
- `authorized_keys` 전체를 교체하지 말고 **한 줄 append**만

예시 (로컬 키 생성 — 프라이빗 키는 커밋 금지):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tm_deploy_ed25519 -C "tm-deploy@$(date +%Y%m%d)" -N ""
cat ~/.ssh/tm_deploy_ed25519.pub
```

서버에서 퍼블릭 키만 추가:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAA...PLACEHOLDER_PUBKEY... tm-deploy@YYYYMMDD' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## 3. 포트·디렉터리·프로세스 감사

| 항목 | 값 | 비고 |
|------|-----|------|
| 기존 유지 포트 | **80 / 443 / 3000** | 절대 막거나 재바인딩하지 않음 |
| TM 앱 포트 | **8088만** | Vite preview / 로컬 프록시 대상 |
| 앱 디렉터리 | `/home/ubuntu/apps/tm` | 신규; 기존 앱 경로와 분리 |
| pm2 이름 | `tm-game` | 기존 pm2 프로세스와 이름 충돌 금지 |

배포 전 확인 예시:

```text
ss -tlnp | grep -E ":80|:443|:3000|:8088" || true
pm2 list
ls -la /home/ubuntu/apps/
```

---

## 4. 배포 단계 (앱)

서버에서:

```text
mkdir -p  /home /ubuntu /apps /tm
cd  /home /ubuntu /apps /tm
# 코드 배치 후 (시크릿 파일 제외)
npm ci
npm run build
pm2 start npm --name tm-game -- run preview -- --host 127.0.0.1 --port 8088
pm2 save
```

스모크 (서버 로컬):

```text
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8088/
# 기대: 200대
```

배포 전 확인 예: listening 포트 80/443/3000/8088, pm2 list, /home/ubuntu/apps/ 존재.

**권장:** preview는 127.0.0.1 만 바인딩, 외부는 nginx 80/443만 공개.

---

## 5. UFW (선택) — 8088만 추가

기존 규칙을 바꾸지 않는다. 공개 프록시만 쓰면 8088을 열지 않는 편이 더 안전하다.

```text
sudo ufw status numbered
# 다른 규칙을 삭제·리셋하지 말 것
# 정말 직접 공개가 필요할 때만:
sudo ufw allow 8088/tcp comment "TM vite preview (optional)"
sudo ufw status
```

---

## 6. OCI Network Security Group (NSG)

| 옵션 | 권장도 | 설명 |
|------|--------|------|
| **A. 80/443만 퍼블릭 + nginx 프록시** | **권장** | 8088은 인스턴스 내부만. 기존 80/443 ingress 유지. |
| **B. 8088 퍼블릭 추가** | 선택 | 임시 디버깅용. 소스 CIDR 최소화. 기존 규칙 삭제 금지. |

1. 기존 TsutaAI용 ingress를 삭제·수정하지 않는다.
2. 필요하면 새 규칙만 추가한다.
3. 배포 후 8088 퍼블릭 규칙은 제거를 권장한다.

---

## 7. Cloudflare DNS

| 설정 | 값 |
|------|-----|
| Type | **A** |
| Name | `tm` |
| IPv4 | 오리진 퍼블릭 IP (예: `217.142.243.78`) |
| Proxy | **Proxied** (주황색 구름 ON) |
| 결과 URL | `https://tm.tsutaai.com` |

TTL은 Auto로 둬도 된다. DNS만 바꾸고 nginx/SSL이 없으면 525/526 또는 잘못된 사이트가 보일 수 있다. 8·9절을 진행한다.

---

## 8. nginx — 왜 80만으로는 CF Full에서 실패하는가

**증상:** `tm.tsutaai.com` 이 예전 TsutaAI(또는 기본) 사이트로 보인다.

**원인:** Cloudflare **Full** 은 오리진에 HTTPS(443)로 접속한다. nginx에 tm 용 443 server 가 없으면 기본/다른 server_name 의 443 vhost가 응답한다. listen 80 만 추가해서는 해결되지 않는다.

### 예시: TM 전용 사이트 (기존 tsutaai vhost는 수정하지 않음)

파일 예: `/etc/nginx/sites-available/tm.tsutaai.com`

HTTP(80)와 HTTPS(443) 양쪽 server 블록에 `server_name tm.tsutaai.com;` 을 두고,
`location /` 에서 `proxy_pass http://127.0.0.1:8088;` 로 전달한다.
프록시 헤더: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto 를 설정한다.
443 블록에는 ssl_certificate / ssl_certificate_key 경로를 지정한다 (자가서명·Origin CA·LE 중 택일).

전체 server 블록 예시:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tm.tsutaai.com;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name tm.tsutaai.com;

    ssl_certificate     /etc/nginx/ssl/tm.tsutaai.com.crt;
    ssl_certificate_key /etc/nginx/ssl/tm.tsutaai.com.key;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

활성화 (기존 사이트 파일은 건드리지 않음):

```text
sudo ln -sf /etc/nginx/sites-available/tm.tsutaai.com /etc/nginx/sites-enabled/tm.tsutaai.com
sudo nginx -t && sudo systemctl reload nginx
```

**남길 것:** `tsutaai.com` 등 기존 sites-enabled 항목·인증서·upstream은 그대로.

---

## 9. 인증서 선택표

| 방식 | CF 모드 | 장점 | 주의 |
|------|---------|------|------|
| **자가서명 + Full** | Full | 빠름; 현재 스냅샷에서 흔함 | Full (strict)에서는 526. 키는 서버에만. |
| **Cloudflare Origin CA** | Full (strict) 권장 | CF↔오리진 전용, 무료·장기 | 브라우저 직접 오리진 접속에는 부적합. 프라이빗 키 비커밋. |
| **Let's Encrypt** | Full (strict) 가능 | 공인 인증서 | 주황 구름(Proxied)이면 HTTP-01이 CF 경유. DNS-01 또는 CF 연동 필요. Flexible 혼용 시 혼란. |

키 파일 권한 예: 개인키 600, owner root. 내용은 커밋하지 않는다.

---

## 10. 검증 체크리스트 & 트러블슈팅

### 체크리스트

- [ ] 루프백 8088 HTTP 응답 정상
- [ ] tm-game 프로세스 online, 포트 8088
- [ ] nginx 설정 테스트 successful
- [ ] 로컬에서 tm.tsutaai.com:443 을 127.0.0.1 로 resolve 해 HTTPS 확인
- [ ] 브라우저 `https://tm.tsutaai.com` → TM UI (기존 TsutaAI 아님)
- [ ] CF SSL 모드가 의도한 Full / Full (strict)
- [ ] 기존 80/443/3000 서비스·프로세스·vhost 정상

### 트러블슈팅

| 증상 | 가능 원인 | 조치 |
|------|-----------|------|
| **예전 사이트가 보임** | TM용 443 server_name 없음; 기본 vhost 폴백 | 443 블록 추가 후 nginx 테스트·reload. server_name 오타 확인. |
| **525** | CF→오리진 HTTPS 실패 (443 미개방·nginx down·방화벽) | OCI NSG/UFW 443, nginx listen 443, 프로세스 확인. |
| **526** | Full (strict)인데 오리진 인증서 미신뢰 | Origin CA/공인 인증서로 교체, 또는 임시 Full(비-strict). |
| **CF 403** | WAF·Bot Fight·국가 차단 등 | CF Security/WAF 이벤트 확인; TM 호스트 예외. 오리진 IP 직접 차단 여부 확인. |
| **연결 시간 초과** | NSG/UFW/보안 목록 | 80/443 ingress·ufw 확인. 기존 규칙 삭제 말고 추가. |
| **8088만 되고 도메인 안 됨** | DNS/프록시/nginx | CF A·Proxied, proxy_pass 대상 127.0.0.1:8088. |

---

## 11. 롤백

1. **프로세스:** tm-game 만 stop/delete. 다른 앱 프로세스는 유지.
2. **nginx:** sites-enabled 에서 tm.tsutaai.com 링크만 제거 → 설정 테스트 → reload. 기존 tsutaai conf는 그대로.
3. **DNS:** CF에서 tm A 레코드 비활성/삭제 또는 Proxied 해제 후 점검 (운영 정책에 따름).
4. **방화벽:** 추가했던 8088 UFW/NSG 규칙만 제거. 기존 80/443/3000 유지.
5. **코드:** `/home/ubuntu/apps/tm` 이전 릴리스로 되돌리거나 보관 후 재배포.

롤백 후 기존 TsutaAI HTTPS가 정상인지 반드시 확인한다.

---

## 12. 스냅샷 메모 (2026-08-24)

| 항목 | 값 |
|------|-----|
| 문서 경로 (리포) | `DEPLOY_ORACLE_CLOUDFLARE.md` |
| 서버 앱 경로 | `/home/ubuntu/apps/tm` |
| pm2 | `tm-game` |
| 로컬 포트 | `8088` → nginx proxy_pass `http://127.0.0.1:8088` |
| 공개 | 가급적 **80/443만** (CF Proxied) |
| SSL | **Full** + (현재) 자가서명 가능 / 장기적으로 Origin CA 또는 LE + Full (strict) |
| URL | `https://tm.tsutaai.com` |
| 예시 IP | `217.142.243.78` |
| 분리 | 기존 TsutaAI 포트·vhost·프로세스 **미변경** |
| 시크릿 | 프라이빗 키·인증서 키 **비포함·비커밋** |

---

## 관련 금지 요약

- Git / PR / 채팅에 SSH·TLS **프라이빗 키** 붙여넣기 금지
- 기존 80/443/3000 규칙·서비스 삭제 금지
- TsutaAI nginx/pm2 설정 덮어쓰기 금지
- Flexible ↔ Full 전환 시 오리진 listen/인증서 재확인 없이 배포하지 말 것

이 문서만으로도 재현 가능한 배포를 목표로 하되, **실제 키 자료는 서버·시크릿 매니저에만** 둔다.
