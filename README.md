# 口琴跟吹助手 HarmonicaFlow

辅助口琴吹奏的跟吹应用：导入乐谱 → 自动编配到口琴孔位 → 音块随时间下落，方块压到判定线就是该吹的时刻。

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
| 跟吹视图 | 纵向落块 + 近大远小透视 + 底部 `1234567` 简谱标注 |
| 触碰特效 | 方块压到判定线时在该列播放脉冲环（特效可插拔） |
| 主题 | 跟随系统 / 浅色 / 深色；主色可调，深浅两套配色自动派生 |
| 界面 | 自建设计系统组件层（令牌 + 自绘 SVG 图标），零新增依赖，整体风格统一 |
| 播放控制 | 播放 / 暂停 / 重播 / 倍速（0.5 / 0.75 / 1）/ 进度拖动 |
| 设置 | 主题、主色、透视强度、口琴预设、音阶表校对集中在设置页 |

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
src/core/             纯 TS 核心：乐谱解析、编配算法、音高与简谱、音阶预设
src/player/           时序与播放状态机
src/theme/            主题色板、几何令牌（间距/圆角/投影）与 Provider
src/ui/               音块时间轴、播放条
src/ui/components/    设计系统组件（图标/卡片/按钮/徽标/分段控件/列表行/口琴插画）
src/ui/effects/       触碰特效（接口 + 注册表 + 默认脉冲环）
src/store/            曲库与偏好持久化
assets/songs/         内置示例曲
docs/                 PRD 与技术方案
scripts/verify-core.ts  核心逻辑自检脚本（无 UI，Node 直接跑）
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
3. Expo Go 真机自测通过：方块下落、透视、底部简谱、触碰特效、主题切换、乐谱导入、音阶表校对。
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
