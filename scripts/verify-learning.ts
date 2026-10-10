import assert from 'node:assert/strict';
import { arrange } from '../src/core/arrange';
import { getLayout, KEY_OPTIONS, keyShift, LAYOUTS, transposeHoles } from '../src/core/layouts';
import { buildExercise, EXERCISES } from '../src/core/learning';
import { keySignatureToTonicPc, pitchClass } from '../src/core/pitch';
import { buildTimeline } from '../src/player/timing';

export function verifyLearning() {
  let count = 0;
  for (const base of LAYOUTS) {
    for (const key of KEY_OPTIONS) {
      const holes = transposeHoles(base.holes, keyShift(base.key, key));
      const layout = getLayout(base.id, { [base.id]: holes }, { [base.id]: key });
      assert.equal(layout.key, key);
      assert.ok(layout.name.includes(`${key} 调`));
      assert.deepEqual(layout.holes, holes, '读取元数据不应再次移调');
      for (const exercise of EXERCISES) {
        const score = buildExercise(exercise.id, layout);
        assert.ok(score, `${base.id}/${key}/${exercise.id} 应有完整八度`);
        assert.deepEqual(buildExercise(exercise.id, layout), score, '同一输入应可复现');
        assert.equal(score.keySignature, key);
        assert.equal(pitchClass(score.events[0].midi), keySignatureToTonicPc(key));
        assert.equal(arrange(score, layout).stats.feasibleCount, score.events.length, '不得用不可吹占位音教学');
        const beats = exercise.id === 'scale' ? 16 : exercise.id === 'steps' ? 28 : 12;
        assert.ok(Math.abs(buildTimeline(score).contentMs - beats * 1000) < 0.001);
        const gaps = score.events.slice(1).map((note, index) => note.startTicks - score.events[index].startTicks - score.events[index].durationTicks);
        assert.equal(gaps.filter((gap) => gap === 480).length, exercise.id === 'steps' ? 6 : exercise.id === 'rhythm' ? 2 : 0);
        count += 1;
      }
    }
  }
  const base = LAYOUTS[0];
  const empty = { ...base, holes: [] };
  assert.equal(buildExercise('scale', empty), null);
  assert.equal(buildExercise('missing', base), null);
  assert.equal(buildExercise('steps', { ...base, holes: [{ index: 1, blow: 60, draw: 62 }] }), null);
  const edited = getLayout(base.id, { [base.id]: base.holes.slice(0, 8) }, { [base.id]: 'G' });
  assert.ok(edited.name.includes('8 孔'));
  assert.equal(getLayout('missing').id, base.id);
  assert.equal(getLayout(base.id, undefined, { [base.id]: 'invalid' }).key, base.key);
  console.log(`✓ 入门练习 ${count} 组琴型/调号/练习：音高、可吹性、时值、休止与确定性通过`);
}
