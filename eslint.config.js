// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    /**
     * React Compiler 系列规则（eslint-plugin-react-hooks v7 起默认开启）与本项目的两条约定冲突，
     * 属于**误报**，逐条说明后关闭：
     *
     * - `react-hooks/immutability`
     *   Reanimated 的官方用法就是给 SharedValue 赋值（`sv.value = x`），规则会判成「修改不可变值」，
     *   必然误报（usePlayback / NoteTimeline / Slider 共 8 处）。
     * - `react-hooks/refs`
     *   本项目多处用「ref 镜像最新值」，让只创建一次的 PanResponder / 回调读到最新 props
     *   （Slider / prefs / usePlayback）。这些 ref 只在事件与副作用里读写，不在渲染期取值，
     *   不存在规则担心的「渲染读 ref 导致不更新」问题。
     * - `react-hooks/set-state-in-effect`
     *   本项目的用法是「输入（曲目 id / 口琴预设）变化时重置派生状态」，属 React 官方文档认可的
     *   场景（"adjusting state when a prop changes"）。真正的重复渲染风险由保持开启的
     *   `react-hooks/exhaustive-deps` 兜底。
     *
     * 若未来重构掉这些模式，可以逐条删掉这里的豁免、让规则重新生效。
     */
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
