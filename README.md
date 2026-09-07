# 자리온 1.0.1

Windows 교실 자리 배치 프로그램입니다. 이름 붙여넣기, 줄·모둠 배치, 책상·학생 이동, 교사용 준비 배정, 결과 발표, 저장·인쇄와 GitHub Releases 자동 업데이트를 제공합니다.

## 학교 컴퓨터에서 실행

- **Seaton-Setup-1.0.1-x64.exe**: 권장 설치 버전. 설치한 뒤 바탕화면의 ‘자리온’을 실행합니다. GitHub에 새 버전이 공개되면 자동으로 확인하고 내려받습니다.
- **Seaton-Portable-1.0.1-x64.exe**: 설치 없이 실행하는 버전. 자동으로 EXE를 교체하지 않으며 새 버전을 직접 내려받습니다. 작업 자료는 실행 파일 옆이 아닌 해당 Windows 사용자 자료 폴더에 저장됩니다.
- 대상: Windows 10/11 64비트. 프로그램 사용·자료 저장·인쇄는 오프라인으로 가능하며 업데이트 확인·다운로드에는 인터넷이 필요합니다.
- 최초 전달 빌드는 코드 서명 인증서가 없는 빌드입니다. 학교 PC의 앱 실행 정책에 따라 실행이 제한될 수 있습니다.

**다운로드 및 업데이트 경로:** [최신 버전 다운로드](https://github.com/Chemtea/seaton/releases/latest)에서 설치 파일을 받습니다. 설치 버전은 `Chemtea/seaton`에 공개되는 이후 버전을 받습니다. 저장소 이름을 바꿔 배포하면 변경된 경로로 만든 설치 버전을 한 번 설치해야 합니다.

## 기본 사용

1. 왼쪽 위 ‘자리온’을 눌러 숫자 6~12자리 PIN을 설정합니다. 이후 편집 설정을 열 때 PIN을 입력합니다.
2. 메모장·엑셀의 이름을 붙여넣고 명단을 적용합니다. 줄바꿈·탭·쉼표를 구분자로 인식합니다. 동명이인은 서로 다른 학생으로 유지됩니다.
3. 이름 입력 아래 배치 설정에서 **줄 배치** 또는 **모둠**을 선택합니다. 줄은 4·5·6·7줄과 각 줄 인원을, 모둠은 각 모둠 인원과 가로 모둠 수를 각각 정합니다. 예: 26명은 2모둠·5모둠만 5명, 나머지 4모둠은 4명으로 설정합니다.
4. 책상 이동·학생 이동·모둠 이동 모드를 선택해 드래그합니다. 필요 없는 책상을 삭제하거나 책상·임시칸을 추가할 수 있습니다. 빈 임시칸은 학생 공개 화면과 인쇄에서 표시하지 않습니다.
5. ‘학생 공개 화면’을 열어 학생에게 자리표를 보여 줍니다. 교사용 준비 배정 화면에서는 ‘잠그고 공개’를 누릅니다. 편집 상태와 교사용 준비 배정은 공개 화면에 표시하지 않습니다.

## 교사용 준비 배정

- 책상 구성을 먼저 마친 뒤 잠금이 해제된 설정에서 ‘교사용 준비 배치’를 엽니다.
- 고정된 자리마다 학생 이름을 선택하고 **준비 배정 저장**을 누릅니다. 이미 선택된 학생은 두 자리 사이에서 교환됩니다. 준비 과정에서 공개 자리표나 책상 위치는 바뀌지 않습니다.
- **Ctrl + 섞기** 또는 **Ctrl + 자리 결과 발표**로 준비된 이름 배정만 적용합니다. 좌표는 현재 책상 위치를 유지합니다.
- 일반 클릭은 새로운 결과를 만듭니다. 발표 횟수를 7회로 설정하면 6회 빠른 섞기 후 마지막 회차에 결과를 공개합니다. 효과음과 약한 연출을 선택할 수 있습니다.
- 학생·책상 구성이 달라져 준비 배정을 적용할 수 없으면 다시 준비해야 합니다. 잘못된 준비 배정을 다른 결과로 대체해 발표하지 않습니다.
- 앱을 다시 실행한 뒤에는 한 번 PIN을 입력해야 저장한 준비 배정을 사용할 수 있습니다. 잠근 뒤에도 그 실행 중에는 Ctrl 발표가 가능합니다.
- 준비 배정은 PIN으로 암호화해 저장합니다. PIN을 분실하면 그 준비 배정을 복호화할 수 없습니다. 공개된 이름·자리표까지 PIN으로 암호화되는 것은 아닙니다.

## 저장·다른 PC로 옮기기·인쇄

- 앱의 작업 상태는 Windows 사용자별 자료 폴더에 자동 저장합니다. 프로그램 파일과 분리하여 업데이트 때 유지합니다.
- ‘파일 저장’으로 별도의 자리표 파일을 만들고 ‘불러오기’로 다시 불러올 수 있습니다. 다른 컴퓨터로 옮길 때는 그 파일과 해당 PIN을 사용합니다.
- 교탁용과 학생용은 서로 반대 방향에서 읽을 수 있게 책상 좌표를 바꾸고 이름 글자는 똑바로 표시합니다.
- 인쇄·PDF·PNG에는 공개할 최종 자리표만 포함합니다. 빈 임시칸, 편집 도구, PIN, 준비 배정 설정은 포함하지 않습니다.
- 프로그램을 삭제해도 사용자 작업 자료는 기본적으로 지우지 않습니다. 공용 PC에서는 각 교사의 Windows 계정으로 사용하거나 작업 파일을 별도로 관리하세요.

## 자동 업데이트 동작

설치 버전은 실행 약 15초 뒤와 이후 6시간 간격으로 공개 GitHub Release를 확인합니다. 새 버전이 있으면 내려받고 교사 설정의 업데이트 상태에 표시합니다. **업데이트 적용**을 눌렀을 때 자료 저장을 마친 뒤 설치·재실행합니다. 발표 중에는 설치하지 않으며 일반 종료만으로 설치를 시작하지 않습니다.

업데이트 서버는 학생 이름·자리표·준비 배정을 받지 않습니다. 앱에는 GitHub 인증 토큰을 넣지 않습니다. 공개 Releases를 사용하며 다운로드 검증은 electron-updater에 맡깁니다.

## GitHub에 첫 배포하기

`main`에 소스를 올리면 Actions가 `package.json` 버전으로 자동 배포를 시작합니다. 해당 버전이 아직 공개되지 않았다면 현재 커밋에 버전 태그를 만들고 Windows EXE와 업데이트 정보를 함께 공개합니다. 이미 공개된 버전이면 다시 빌드하거나 파일을 덮어쓰지 않습니다. 별도로 `v1.0.0` 같은 태그를 올리는 기존 배포 방식도 지원합니다.

### 간단 실행

개발용 Windows PC에 [Node.js 24 LTS](https://nodejs.org/), [Git](https://git-scm.com/downloads/win), [GitHub CLI](https://cli.github.com/)를 설치합니다. PowerShell에서 한 번 `gh auth login`으로 로그인한 다음 **Publish-GitHub.cmd**를 실행합니다.

스크립트는 저장소 이름을 묻고 기본값 `Chemtea/seaton`을 제시합니다. 공개 게시 내용을 확인한 후 `PUBLISH`를 입력하면 공개 저장소 생성, 소스 커밋, 버전 태그 게시를 진행합니다. 학생 작업 파일은 게시 목록에 포함하지 않습니다. GitHub Actions가 Windows 설치 파일과 업데이트 정보를 만들고 Release를 공개합니다.

이미 같은 버전 태그가 있으면 덮어쓰지 않습니다. 첫 시도가 네트워크 오류로 중단되었다면 아래의 수동 방식으로 남은 push를 완료하거나 Actions에서 기존 태그로 다시 실행합니다.

### 수동 실행

1. GitHub에 빈 **public** 저장소 `seaton`을 만듭니다. 다른 기존 프로젝트 저장소를 사용하지 않습니다.
2. 이 폴더에서 아래를 실행합니다. 이미 git 설정·커밋·remote가 있으면 중복되는 명령은 생략합니다.

```powershell
npm.cmd ci
npm.cmd test
git init -b main
git config user.name "Chemtea"
git config user.email "Chemtea@users.noreply.github.com"
git add .
git commit -m "Create Seaton 1.0.0"
git remote add origin https://github.com/Chemtea/seaton.git
git push -u origin main
```

3. 저장소 **Actions → Build and release Windows**를 확인합니다. 완료되면 **Releases**에서 설치 파일을 내려받습니다. 별도 GitHub Pages 설정은 필요 없습니다.

Actions는 모든 결과물을 올린 뒤 Release를 공개합니다. 필요한 파일은 설치 EXE, portable EXE, 설치 EXE의 `.blockmap`, `latest.yml`입니다. `latest.yml`이나 설치 파일을 따로 누락하면 자동 업데이트가 작동하지 않습니다.

## 다음 버전 배포

코드를 수정하고 테스트한 뒤 버전을 높여 `main`에 올립니다. Actions가 해당 버전 태그를 만들고 배포합니다.

```powershell
npm.cmd run release:version -- 1.0.2
npm.cmd test
git add .
git commit -m "Update Seaton to 1.0.2"
git push origin main
```

기존 버전 파일과 태그를 덮어쓰지 않습니다. Actions는 태그·package.json·package-lock.json 버전과 실제 커밋이 일치하는지 검사합니다. 실패한 빌드는 Actions에서 **Re-run jobs**를 누르거나 **Run workflow**에 기존 태그를 입력해 같은 소스로 재시도할 수 있습니다. 태그를 만든 뒤 소스를 고쳤다면 버전을 높여 배포합니다. 이미 공개된 Release를 바꿀 때도 새 버전을 만듭니다.

## 로컬 실행·EXE 빌드

```powershell
npm.cmd ci
npm.cmd test
npm.cmd start
npm.cmd run build:win
```

또는 **Build-Windows.cmd**를 실행합니다. 생성 파일은 `dist`에 있습니다. 빌드 시 업데이트 경로 우선순위는 `SEATON_UPDATE_REPOSITORY`, GitHub Actions 저장소, `GH_REPOSITORY`, git origin, `release-repository.json` 순서입니다. 경로가 전혀 없으면 자동 업데이트가 비활성화됩니다.

Windows Actions 빌드는 `CSC_LINK`, `CSC_KEY_PASSWORD` 저장소 secrets가 있으면 인증서로 서명할 수 있습니다. 인증서는 소스나 앱에 넣지 않습니다. 이 두 값이 없으면 서명하지 않은 빌드입니다.

Linux에서 빌드할 때는 `scripts/nsis-static-extract.cjs`가 고정된 electron-builder의 기존 NSIS 정적 추출기를 사용해 제거 프로그램을 추출합니다. Windows 프로그램 실행 없이 패키징하기 위한 빌드 전용 처리이며 앱에 포함하지 않습니다. Windows Actions에서는 기본 빌드 경로를 사용합니다. electron-builder를 올릴 때는 이 어댑터도 함께 점검해야 합니다.

## 구성과 검증 범위

- `app/`: 자리 배치 화면, 조작·발표 로직
- `desktop/`: Electron main/preload, 파일 저장, 준비 배정 암호화, 인쇄, 업데이트
- `tests/`, `test/`: 이름 배정·좌표 유지·파일 검증·암호화·업데이트 상태 전환 검사
- `.github/workflows/windows-release.yml`: Windows EXE와 자동 업데이트 Release 생성

현재 고정 의존성은 Electron 44.2.0, electron-builder 26.15.3, electron-updater 6.8.9입니다. `package-lock.json`으로 하위 의존성도 고정합니다. 자동 업데이트의 실제 다운로드→설치 검증에는 공개된 서로 다른 두 버전과 실제 Windows PC가 필요합니다. 코드 검사·패키징 성공만으로 학교 프린터 출력과 Windows 실행을 모두 검증한 것으로 보지 않습니다.

## 공식 기술 자료

- [Electron 릴리스](https://releases.electronjs.org/)
- [electron-builder 자동 업데이트](https://www.electron.build/docs/features/auto-update/): Windows NSIS 및 업데이트 메타데이터
- [electron-builder 게시 설정](https://www.electron.build/docs/publish/)
- [GitHub Actions checkout](https://github.com/actions/checkout), [Node 설정](https://github.com/actions/setup-node)
- [GitHub CLI Release 생성](https://cli.github.com/manual/gh_release_create)

최신 electron-builder 문서에는 v27·electron-updater v7 옵션도 포함되어 있습니다. 이 프로젝트의 v26·v6에서는 `autoInstallOnAppQuit = false`와 명시적인 `quitAndInstall()`을 사용합니다.
