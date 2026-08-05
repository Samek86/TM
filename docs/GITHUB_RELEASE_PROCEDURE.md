# GitHub 릴리스 절차서 (AI 자동 실행용)

이 문서는 **AI 에이전트가 읽고 순서대로 실행**해 GitHub에 소스를 반영하고 **Release**를 만들기 위한 절차다.  
사람 개입은 **권한·확인이 필요한 단계**에만 요청한다.

---

## 0. 고정 컨텍스트 (프로젝트 상수)

| 키 | 값 |
|----|-----|
| 로컬 루트 | 작업 디렉터리 루트 (이 레포: `TM`) |
| 원격 | `https://github.com/Samek86/TM.git` |
| OWNER/REPO | `Samek86/TM` |
| 기본 브랜치 | `main` |
| 도구 | `git`, `gh` (GitHub CLI), `npm` (검증 시) |
| 패키지 이름 | `tactics-mercenary-revival` (`package.json`) |

**규칙**

- 모든 명령은 **저장소 루트**에서 실행한다.
- 파괴적 명령(`git push --force`, `git reset --hard`, release 삭제)은 **사용자 명시 승인 없이는 실행하지 않는다**.
- 시크릿(`.env`, 토큰, 키)은 커밋·릴리스 에셋에 넣지 않는다.
- `node_modules/`, `.local/` 은 `.gitignore`에 의해 제외된다. 포함하지 않는다.

---

## 1. 사전 조건 검사 (실패 시 중단)

아래를 **순서대로** 실행하고, 하나라도 실패하면 **사용자에게 보고 후 중단**한다.

### 1.1 도구

```bash
command -v git && git --version
command -v gh && gh --version
command -v npm && npm --version
```

### 1.2 GitHub 로그인

```bash
gh auth status
```

성공 조건: `Logged in to github.com` 및 계정 표시.  
실패 시:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

브라우저 인증이 필요하면 **사용자에게 코드/URL을 보여주고 완료될 때까지 대기**한다.  
완료 후 `gh auth status` 재확인.

### 1.3 원격 저장소

```bash
git rev-parse --is-inside-work-tree
git remote -v
gh repo view Samek86/TM --json name,url,defaultBranchRef
```

성공 조건: `origin` → `Samek86/TM`.  
`origin` 없으면:

```bash
git remote add origin https://github.com/Samek86/TM.git
```

### 1.4 브랜치

```bash
git checkout main 2>/dev/null || git checkout -b main
git status -sb
```

---

## 2. 변경 사항 정리 및 푸시 (코드 반영)

### 2.1 상태 파악

```bash
git status
git diff
git diff --staged
git log -5 --oneline
git fetch origin
git status -sb
```

### 2.2 커밋 여부 결정

| 상태 | 행동 |
|------|------|
| 변경 없음 + `main`이 `origin/main`과 동기 | **§3 릴리스로 진행** |
| 미커밋 변경 있음 | §2.3 커밋 후 §2.4 푸시 |
| 커밋만 앞서 있음 (ahead) | §2.4 푸시 |
| 원격이 앞서 있음 (behind) | `git pull --rebase origin main` 후 충돌 해결. 해결 불가면 **중단·사용자 보고** |

### 2.3 스테이징 · 커밋

```bash
git add -A
git status --short
```

커밋 메시지 규칙:

- 완전한 문장, 무엇을 왜 바꿨는지 1–3문장.
- 예: `Improve loading gate and hover/mine/cloud weapons.`

```bash
git commit -m "$(cat <<'EOF'
<한 줄 요약>

<필요 시 본문: 변경 의도 / 사용자 체감 효과>
EOF
)"
```

커밋할 내용이 없으면 (`nothing to commit`) 다음 단계로.

**커밋 금지 파일 확인**

```bash
git diff --cached --name-only | grep -E '\.env$|\.pem$|credentials|secret' && echo 'BLOCK: secrets staged' && exit 1 || true
```

시크릿이 스테이징되면 **즉시 중단**, `git reset` 후 사용자 보고.

### 2.4 푸시

```bash
gh auth setup-git 2>/dev/null || true
git config http.postBuffer 524288000
git push -u origin main
```

HTTP 400/끊김 시 1회 재시도. 계속 실패하면 대용량 파일 검사:

```bash
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '/^blob/ && $3 > 90000000 {print $3, $4}'
```

100MB 초과 blob이 있으면 **Git LFS 또는 제외 후 재커밋** 필요 → 사용자 보고 후 중단.

성공 조건:

```bash
git status -sb
# 기대: main...origin/main (ahead/behind 없음)
```

---

## 3. 릴리스 버전 결정

### 3.1 입력 (우선순위)

1. 사용자가 명시한 버전 (예: `v0.2.0`, `0.2.0`)
2. 없으면 최근 태그에서 패치 증가
3. 태그 없으면 `v0.1.0`

```bash
gh release list --limit 5
git tag -l 'v*' --sort=-v:refname | head -10
```

버전 정규화:

- 항상 **`v` 접두사** 태그: `vMAJOR.MINOR.PATCH` (SemVer)
- 사용자 입력 `0.2.0` → `v0.2.0`
- pre-release: `v0.2.0-beta.1` (필요 시 `--prerelease`)

### 3.2 태그 중복 검사

```bash
TAG=vX.Y.Z   # 결정된 값으로 치환
git rev-parse "refs/tags/$TAG" >/dev/null 2>&1 && echo "TAG_EXISTS" || echo "TAG_FREE"
gh release view "$TAG" >/dev/null 2>&1 && echo "RELEASE_EXISTS" || echo "RELEASE_FREE"
```

- `TAG_EXISTS` 또는 `RELEASE_EXISTS` → **덮어쓰지 않음**. 새 버전 제안 또는 사용자 확인 후만 `gh release delete` / 태그 삭제.

---

## 4. (권장) 릴리스 전 검증

환경이 허용되면 실행. 실패 시 **사용자에게 알리고**, 사용자가 “검증 무시하고 릴리스”라고 하면 §5로 진행.

```bash
export PATH="$PWD/.local/node/bin:$PATH"   # 로컬 node 사용 시
npm run typecheck
# 선택: npm run build   # 시간·환경 이슈 시 스킵 가능
```

---

## 5. Git 태그 생성 및 푸시

태그는 **현재 `main`의 HEAD** (`origin/main`과 동일해야 함)에 단다.

```bash
TAG=vX.Y.Z
git checkout main
git pull --ff-only origin main
git status -sb   # clean + synced

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"
```

성공 조건: `git ls-remote --tags origin | grep "$TAG"`

---

## 6. GitHub Release 생성

### 6.1 릴리스 노트 초안

`git log`로 이전 태그..HEAD 요약을 만든다.

```bash
PREV=$(git tag -l 'v*' --sort=-v:refname | sed -n '2p')  # 직전 태그; 없으면 비움
if [ -n "$PREV" ]; then
  git log --oneline "${PREV}..HEAD"
else
  git log --oneline -20
fi
```

노트 템플릿 (파일로 저장 후 `gh`에 전달):

```markdown
## What's Changed

- <불릿: 사용자 관점 변경점>
- ...

## Meta

- Branch: `main`
- Commit: `<short sha>`
- Repo: https://github.com/Samek86/TM
```

### 6.2 릴리스 생성 명령

```bash
TAG=vX.Y.Z
NOTES_FILE=$(mktemp)
# NOTES_FILE에 위 마크다운 작성

gh release create "$TAG" \
  --repo Samek86/TM \
  --title "TM $TAG" \
  --notes-file "$NOTES_FILE" \
  --target main \
  --verify-tag
```

옵션 매핑:

| 상황 | 추가 플래그 |
|------|-------------|
| 베타/RC | `--prerelease` |
| 초안만 (공개 전) | `--draft` (사용자가 draft 원할 때만) |
| 최신 릴리스로 표시 안 함 | `--latest=false` |

에셋 업로드가 필요하면 (기본 소스 코드 zip은 GitHub가 자동 제공):

```bash
gh release upload "$TAG" path/to/asset.zip --clobber
```

**기본 정책**: 별도 바이너리 빌드 에셋이 없으면 **태그 + 릴리스 노트만** 생성한다.  
`public/archive` 원본 설치 파일 전체를 릴리스 에셋으로 올리지 않는다 (용량·라이선스).

### 6.3 생성 확인

```bash
gh release view "$TAG" --repo Samek86/TM
gh release list --repo Samek86/TM --limit 3
```

성공 조건: URL `https://github.com/Samek86/TM/releases/tag/vX.Y.Z` 가 열림.

---

## 7. 완료 보고 (AI → 사용자)

다음 형식으로 짧게 보고한다.

```text
Release complete
- Repo: https://github.com/Samek86/TM
- Tag / Release: vX.Y.Z
- URL: https://github.com/Samek86/TM/releases/tag/vX.Y.Z
- Commit: <sha>
- Pushed main: yes/no
- Checks: typecheck pass/skip
```

---

## 8. 한 줄 실행 요약 (체크리스트)

AI는 아래를 **위에서 아래로** 처리한다.

1. [ ] `gh auth status` OK  
2. [ ] `main` 체크아웃, fetch  
3. [ ] 변경 있으면 커밋 (시크릿 없음)  
4. [ ] `git push origin main`  
5. [ ] 버전 `vX.Y.Z` 결정 (중복 없음)  
6. [ ] (권장) `npm run typecheck`  
7. [ ] annotated tag + `git push origin vX.Y.Z`  
8. [ ] `gh release create` + notes  
9. [ ] `gh release view` 로 확인 후 사용자 보고  

---

## 9. 사용자 발화 → 행동 매핑

| 사용자 말 | AI 행동 |
|-----------|---------|
| “푸시해줘” | §1–§2 만 (릴리스/태그 없음) |
| “릴리스 해줘” / “release” | §1–§7 전체. 버전 미지정이면 §3.1 자동 증가 후 진행, 보고에 버전 명시 |
| “v0.3.0으로 릴리스” | 해당 태그로 §1–§7 |
| “드래프트 릴리스” | `gh release create --draft` |
| “베타 릴리스” | SemVer pre-release + `--prerelease` |
| “릴리스만” (이미 푸시됨) | §3–§7 |
| “강제 푸시 / 태그 덮어쓰기” | **거부 또는 재확인**. 승인 문구가 있을 때만 |

---

## 10. 실패 대응

| 증상 | 조치 |
|------|------|
| `gh` not logged in | `gh auth login --web` → 사용자 인증 |
| `could not read Username` | `gh auth setup-git` 후 재push |
| HTTP 400 / disconnect on push | `http.postBuffer` 증가 후 1회 재시도; 대용량 파일 검사 |
| tag already exists | 새 패치 버전 제안 |
| typecheck fail | 보고; 사용자 승인 시에만 릴리스 계속 |
| merge conflict on pull | 중단, 충돌 파일 목록 제시 |
| 빈 커밋 | 커밋 스킵하고 푸시/릴리스만 |

---

## 11. 금지 사항

- `git push --force` / `--force-with-lease` (명시 승인 없이)
- `main` 히스토리 rewrite
- `.env`, 인증 토큰, 개인 키 커밋
- 기존 GitHub Release/태그를 묻지 않고 삭제
- `node_modules` 커밋
- 사용자 요청 없이 `--draft`를 정식 릴리스로 전환하지 않기

---

## 12. 최소 복사 가능한 명령 시퀀스 (버전 확정 후)

`TAG` 만 바꿔 실행 가능한 템플릿.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TAG=v0.1.0

gh auth status
gh auth setup-git 2>/dev/null || true
git checkout main
git fetch origin
git pull --ff-only origin main

# 변경 있으면 커밋 (메시지는 AI가 상황에 맞게)
# git add -A && git commit -m "..."

git push origin main

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

SHA=$(git rev-parse --short HEAD)
NOTES=$(mktemp)
cat > "$NOTES" <<EOF
## What's Changed

- See commit history on main.

## Meta

- Commit: ${SHA}
- Repo: https://github.com/Samek86/TM
EOF

gh release create "$TAG" \
  --repo Samek86/TM \
  --title "TM $TAG" \
  --notes-file "$NOTES" \
  --target main \
  --verify-tag

gh release view "$TAG" --repo Samek86/TM
rm -f "$NOTES"
```

---

## 13. 문서 유지

- 원격 OWNER/REPO 또는 기본 브랜치가 바뀌면 **§0 표만** 갱신한다.
- 이 파일 경로: `docs/GITHUB_RELEASE_PROCEDURE.md`
- 사용자/AI가 “릴리스 절차서 따라 해줘”라고 하면 **이 문서를 읽고 실행**한다.
