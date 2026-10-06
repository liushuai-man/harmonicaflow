# 口琴跟吹助手 HarmonicaFlow

辅助口琴吹奏的跟吹应用：导入乐谱 → 自动编配到口琴孔位 → 音块随时间流入判定线（方向可自由选择：**从上到下** / **从左到右** / **自动**），方块压到判定线就是该吹的时刻。

- 技术栈：Expo SDK 57 · React Native 0.86 · React 19 · TypeScript · Expo Router · Reanimated 4 · react-native-svg
- 交付形态：安装到 Android 手机的独立 App（出包走 EAS 云端构建，**本地不需要装 Java/Android Studio**）
- 详细设计：[docs/PRD.md](./docs/PRD.md)（需求）· [docs/TECH_DESIGN.md](./docs/TECH_DESIGN.md)（技术方案，**§11 为构建与部署方案**）· [docs/AI_SCORING.md](./docs/AI_SCORING.md)（录音评测方案，规划中）· [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)（系统架构：后端 / PC 端 / AI 层，规划中）

---

## 1. 功能一览

| 能力 | 说明 |
|---|---|
| 乐谱导入 | JSON / ABC 记谱 / MusicXML（`.musicxml` `.xml` `.mxl`） |
| 自动编配 | 解析音高与时值 → 束搜索编配到孔位与吹吸 → 标记不可吹音 |
| 口琴预设 | 24 孔复音 / 10 孔布鲁斯 / 半音阶，可切换；音阶表可逐孔校对 |
| 跟吹视图 | **落块方向**（从上到下 / 从左到右 / 自动）+ 视角（垂直↔斜视，连续可调）+ 命中高亮 |
| 视觉风格 | **白线皮肤（默认）**：黑白灰渐变背景 + 白色线条；可切彩色皮肤；透明度、主题色可调 |
| 横向琴谱 | 完整谱面 / 判定线附近精简提示条 / 关闭，三态可切换 |
| 音乐封面 | 本地优先；在线随机封面为可选开关（默认关，拉取后缓存本地、离线自动回退） |
| 触碰特效 | 方块压到判定线时在该列播放脉冲环（特效可插拔） |
| 主题 | 跟随系统 / 浅色 / 深色；皮肤（白线 / 彩色）；主色、透明度可调 |
| 界面 | 自建设计系统组件层（令牌 + 自绘 SVG 图标），零新增依赖，整体风格统一 |
| 播放控制 | 播放 / 暂停 / 重播 / 倍速（0.5 / 0.75 / 1）/ 进度拖动 |
| 设置 | 外观（深浅 / 皮肤 / 主色 / 透明度）、跟吹视图（方向 / 视角 / 琴谱）、封面、口琴预设、音阶表集中在设置页 |

---

## 2. 环境准备

| 项 | 要求 |
|---|---|
| Node.js | 20 或以上（自带 npm） |
| 手机 | Android，安装 [Expo Go](https://expo.dev/go)（开发联调用） |
| 网络 | 手机与电脑处于同一局域网（或使用 `--tunnel`） |
| Expo 账号 | **仅出包/热更新需要**，免费计划即可（[注册](https://expo.dev/signup)） |

不需要安装 JDK、Android Studio、Xcode。

```bash
# 首次拉取依赖
npm install
```

---

## 3. 项目结构

```
src/app/              页面（Expo Router 路由）：index / practice/[id] / settings
src/core/             纯 TS 核心：乐谱解析、编配算法、音高与简谱、音阶预设、视觉参数（core/visual）
src/player/           时序与播放状态机
src/theme/            主题色板、皮肤令牌、几何令牌（间距/圆角/投影）与 Provider
src/ui/               音块时间轴（含方向策略 flow）、横向琴谱、播放条
src/ui/components/    设计系统组件（图标/卡片/按钮/徽标/分段控件/列表行/口琴插画）
src/ui/effects/       触碰特效（接口 + 注册表 + 默认脉冲环）
src/store/            曲库与偏好持久化
assets/songs/         内置示例曲
docs/                 PRD 与技术方案
scripts/verify-core.ts  核心逻辑自检脚本（无 UI，Node 直接跑）
.github/workflows/    CI/CD：质量门禁 / EAS 出包 / Web 发布到 GitHub Pages
eas.json              EAS 构建档位
```

---

## 4. 本地开发（最快看到效果）

```bash
npx expo start
```

终端出现二维码后：

1. 手机装好 **Expo Go**；
2. Android 用 Expo Go 内的扫码功能扫终端二维码（iOS 用相机扫）；
3. 应用加载后即可操作。

> 电脑与手机不同网段时用 `npx expo start --tunnel`。
> 改动 JS 保存后会自动热重载，**这一步不需要出包，也不需要 Expo 账号**。

---

## 5. 在手机上安装使用（两种方式）

### 方式一：Expo Go（开发期，1 分钟）

见上一节。适合自己调试，优点是零配置、改完即见；缺点是必须开着电脑的开发服务器，且需要装 Expo Go。

### 方式二：EAS 出 APK 装到手机（可独立运行、可分享）

**一次性接入**：

```bash
# 1) 注册并登录 Expo 账号（免费）
npx eas-cli@latest login
npx eas-cli@latest whoami        # 确认已登录

# 2) 把项目绑定到 EAS（会向 app.json 写入 extra.eas.projectId，属于需要提交的改动）
npx eas-cli@latest init
```

**出包**：

```bash
npx eas-cli@latest build -p android --profile preview
```

- 首次构建会询问 Android 签名密钥（keystore）→ 选 **Generate new keystore**，由 EAS 远端托管，之后所有构建复用同一签名。
- 构建在 Expo 服务器上跑（几分钟到十几分钟），本地只需网络。
- 完成后构建详情页会给出 **APK 下载链接**。

**装到手机**：

1. 把 APK 链接发到手机（微信/邮件/网盘均可），在手机上打开下载；
2. 系统提示时允许「安装未知来源应用」；
3. 安装后即可离线独立运行，不再依赖电脑。

**或用数据线直装**：

```bash
npx eas-cli@latest build:run -p android            # 选一个历史构建装到已连接设备
```

**装不上的常见原因**：

| 现象 | 原因与处理 |
|---|---|
| 提示「应用未安装」 | 手机上已有**同包名但不同签名**的旧包 → 先卸载旧版再装 |
| 覆盖安装失败 | 必须是同一包名 + 同一签名（都走 EAS 托管即一致） |
| 无法安装 | 未允许「安装未知来源应用」 |
| 打开闪退 | 用错了档位：想直接装到手机必须选 `preview`（产物是 APK）；`production` 出的是 AAB，**不能直接安装** |

> 包名 `com.harmonicaflow.app`，**一旦上架 Google Play 就不能再改**。
> 应用数据（导入的乐谱、偏好设置）存在应用沙盒里，卸载会一并丢失。

---

## 6. 热更新（EAS Update）——后期维护方案

**用途**：改 JS / 样式 / 图片等非原生内容时，不用重新出包、不用用户重装，直接在手机上下发新版本。原生依赖变了才必须重新出包。

### 6.1 一次性配置（只做一次）

```bash
# 1) 加入热更新运行时
npx expo install expo-updates

# 2) 由 EAS 写入配置：app.json 的 runtimeVersion / updates.url，
#    并自动给 eas.json 的 preview、production 档位补上 channel 字段
npx eas-cli@latest update:configure

# 3) 提交配置改动，然后【必须重新出一次包】
npx eas-cli@latest build -p android --profile preview
```

> 第 3 步不能省：`channel` 是**打进安装包里**的，手机上的包必须带着 channel 才会去拉更新。
> 这一步之前的旧包无法接收热更新（需重装一次新包）。

### 6.2 日常维护发版（每次改完 JS 后）

```bash
# 1) 本地先自测
npx expo start            # Expo Go 里确认改动没问题
npx tsc --noEmit          # 类型检查

# 2) 提交代码（小步提交，见 AGENTS.md）
git add <改动文件> ; git commit -m "fix: ..."

# 3) 推送热更新到对应渠道
npx eas-cli@latest update --channel preview --message "修复跟吹页方块抖动" --environment preview
# 正式用户用：--channel production --environment production
```

> `--environment` 在 SDK 55 及以上为**必填**，本项目为 SDK 57。它指向 EAS 环境变量集合。

### 6.3 手机上如何拿到更新

- 更新由 App 在**启动时后台自动下载**，下载完成后**重启 App** 生效；
- 实测手法：**杀掉进程后重新打开，最多开两次**即可看到新版本；
- 开发构建（`development` 档位）可在 dev client 的 Extensions 页手动加载更新；
- 检查是否生效：在 EAS 网站该项目的 Updates 页面能看到本次发布的 channel / 分支 / 提交。

### 6.4 边界与注意事项

| 场景 | 能否热更新 |
|---|---|
| 改 JS / TS / 样式 / 文案 | ✅ 可以 |
| 换图片等打包资源 | ✅ 可以 |
| 新增/升级**原生依赖**、改 `app.json` 里影响原生的配置（如包名、权限、图标） | ❌ 必须重新 `eas build` |
| 改 `runtimeVersion` | ❌ 老包不再匹配，必须重新出包 |

- **渠道隔离**：`preview` 与 `production` 是两条独立渠道，先推 preview 验证，确认无误再推 production。
- **回滚**：在 EAS 的 Updates 列表里选历史版本重新发布即可；也可用
  `npx eas-cli@latest update:republish --help` 查看可用参数。
- **不要绕过验证**：热更新会直达用户手机，推 production 前务必先在 preview 渠道和真机上验证。

### 6.5 推荐维护节奏

```
本地改代码 → Expo Go 自测 → tsc/verify 通过 → 小步提交
      → 出 preview 包自测（涉及原生改动时）
      → 推 preview 热更新验证
      → 推 production 热更新 / 或出新版 AAB 上架
```

---

## 7. 发布检查清单

1. `npx tsc --noEmit` 与 `npm run verify` 全绿；`npx expo-doctor` 无问题。
2. `app.json` 的 `version` 已递增；上架 Google Play 时 `android.versionCode` 也要递增。
3. Expo Go 真机自测通过：落块方向（自动 / 从上到下 / 从左到右）、视角、皮肤与透明度、命中高亮、横向琴谱、封面（含离线回退）、触碰特效、乐谱导入、音阶表校对。
4. 出 `preview` APK 装到目标机型复验（独立包与 Expo Go 的原生行为可能不同）。
5. 出 `production` AAB 上架：`npx eas-cli@latest submit -p android --profile production`（需 Google Play 服务账号 JSON）。
6. 若启用热更新，确认 channel 与 runtimeVersion 匹配后再推送。

---

## 8. 常用命令

```bash
npm install                              # 安装依赖
npx expo start                           # 启动开发服务器（扫码用 Expo Go 打开）
npx expo start --tunnel                  # 跨网段联调
npx tsc --noEmit                         # 类型检查
npm run verify                           # 核心逻辑自检（解析/编配/简谱）
npx expo-doctor                          # 依赖与配置体检
npx expo install <包名>                   # 安装依赖（自动选 SDK 兼容版本，勿用 npm i）
npx eas-cli@latest login                 # 登录 Expo 账号
npx eas-cli@latest build -p android --profile preview     # 出可安装的 APK
npx eas-cli@latest build -p android --profile production  # 出上架用的 AAB
npx eas-cli@latest update:configure      # 一次性配置热更新
npx eas-cli@latest update --channel preview --message "..." --environment preview  # 推热更新
```

---

## 9. 已知限制

- **音阶排列需自行校对**：24 孔复音口琴的高音区排列因品牌而异，默认值仅供参考，请用实体琴在设置页逐孔核对。
- **不实现压音（bending）**：10 孔布鲁斯低音区缺失音与 F/A 等会标为不可吹。
- **只取单声部旋律**：同一时刻的和弦保留最高音。
- **仅 Android 出包**：iOS 需要付费的 Apple 开发者账号与证书，暂未纳入。
- 浏览器端（`expo start --web`）不作为支持目标，跟吹页的动效与视口表现以真机为准。

---

## 10. CI/CD 与部署（GitHub Actions）

`.github/workflows/` 下三条流水线，把「质量门禁 → 出包 → 发布」自动化：

| 工作流 | 触发 | 作用 | 需要密钥 |
|---|---|---|---|
| [ci.yml](./.github/workflows/ci.yml) | 推送 `main`、PR、手动 | `npm ci` → `tsc --noEmit` → `npm run verify` → `expo-doctor` | 否 |
| [eas-build.yml](./.github/workflows/eas-build.yml) | 手动（选档位）、推送 `v*` 标签 | 调 EAS 云端出 Android 包（`preview` = 可直装 APK，`production` = 上架 AAB） | **`EXPO_TOKEN`** |
| [deploy-web.yml](./.github/workflows/deploy-web.yml) | 推送 `main`、手动 | `expo export --platform web` → 发布到 GitHub Pages | 否 |

### 10.1 一次性准备

**① 移动端：绑定 EAS 项目并配置 `EXPO_TOKEN`**

```bash
npx eas-cli@latest login
npx eas-cli@latest init      # 向 app.json 写入 extra.eas.projectId，属于需要提交的改动
```

到 https://expo.dev/settings/access-tokens 生成 Access Token，再到 GitHub 仓库
`Settings → Secrets and variables → Actions → New repository secret`，新建名为
**`EXPO_TOKEN`** 的 Secret。

> 没有 `extra.eas.projectId` 时 `eas-build.yml` 会**直接失败并打印提示**，不会静默跳过。

**② PC 端：开启 Pages**

仓库 `Settings → Pages → Build and deployment → Source` 选 **GitHub Actions**
（不要选 "Deploy from a branch"，本方案用 Actions 上传产物）。

### 10.2 日常使用

```bash
git push origin main        # 自动跑 CI + 发布 Web 到 Pages
```

- **移动端出包**：仓库 `Actions → EAS Build (Android) → Run workflow`，选 `preview` 拿 APK 下载链接；
  或打标签出正式包：`git tag v0.2.0 && git push origin v0.2.0`（自动按 `production` 出 AAB）。
- **PC 端访问**：https://liushuai-man.github.io/harmonicaflow/

### 10.3 Web 部署的几个关键点

- **输出模式取 `single`（SPA），不能用 `static`**：跟吹页是动态路由 `practice/[id]`，`id` 来自用户本地导入的曲目，构建期无法用 `generateStaticParams` 预生成 HTML。
- **`experiments.baseUrl = "/harmonicaflow"`**：Pages 站点挂在「仓库名」子路径下，不配这个资源路径会 404（已实测产物为 `/harmonicaflow/_expo/...`）。
- 工作流里做了两处 GitHub Pages 专属适配：`touch dist/.nojekyll`（否则 Jekyll 会忽略 `_expo/` 这类下划线目录）、`cp dist/index.html dist/404.html`（SPA 没有服务端 rewrite，靠 404 回退支持深链接）。
- ⚠️ **Web 版不是完整功能**：跟吹页时间轴在浏览器里渲染不出来（视口高度恒为 0），Pages 上只是残缺 demo，效果以真机为准。

### 10.4 数据与后端

当前**没有后端**，运行时不依赖网络：

- 设置（主题 / 皮肤 / 主色 / 透明度 / 落块方向 / 视角 / 横向琴谱 / 口琴预设 / 音阶表）与导入的乐谱，统一经 `src/store/docStore.ts` 落盘；
- 原生走 `expo-file-system` 应用沙盒，Web 走浏览器 `localStorage`；封面也走同一入口（仅"在线随机封面"开关打开时联网）。
  **注意**：封面字节缓存**只在原生端**发生（Web 端受 `localStorage` 5MB 配额限制，只记远程 URL 不缓存字节）。
- 因此：**卸载 App 或清除浏览器站点数据会丢失数据**；且 Web 与原生各存各的，互不同步。
  后续若要跨端同步，`docStore.ts` 是唯一改造入口。
