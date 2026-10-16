import './global.css';
import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { resolveCounter, setFixEnabled } from './uniwindDataCacheFix';

const CELLS = 400;
const RENDERS = 30;

// The two class strings are identical apart from one data-[] variant.
const PLAIN = 'w-3 h-3 m-px rounded-sm bg-sky-500 border border-sky-700';
const WITH_DATA = `${PLAIN} data-[selected=true]:bg-indigo-900`;

type Mode = 'plain' | 'data';
type ScenarioId = 'plain' | 'stock' | 'fixed';
type Result = { ms: number; resolves: number };

const SCENARIOS: Array<{ id: ScenarioId; label: string; mode: Mode; fix: boolean }> = [
  { id: 'plain', label: 'Plain classes', mode: 'plain', fix: false },
  { id: 'stock', label: '+ data-[] class, Uniwind 1.12.2', mode: 'data', fix: false },
  { id: 'fixed', label: '+ data-[] class, with the fix', mode: 'data', fix: true },
];

function Toggle({
  testID,
  label,
  value,
  disabled,
  onChange,
}: {
  testID: string;
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className='flex-row items-center justify-between border border-gray-300 rounded-lg p-3'
    >
      <Text>{label}</Text>
      <Text className={value ? 'font-bold text-green-700' : 'font-bold text-gray-500'}>
        {value ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function Grid({
  mode,
  selected,
  onCommit,
}: {
  mode: Mode;
  selected: boolean;
  onCommit: () => void;
}) {
  useLayoutEffect(onCommit);

  return (
    <View className='flex-row flex-wrap'>
      {Array.from({ length: CELLS }, (_, i) => (
        <View
          key={i}
          data-selected={selected && i % 2 === 0}
          className={mode === 'data' ? WITH_DATA : PLAIN}
        />
      ))}
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('data');
  const [fix, setFix] = useState(false);
  const [selected, setSelected] = useState(false);
  const [, setTick] = useState(0);
  const [results, setResults] = useState<Partial<Record<ScenarioId, Result>>>({});
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);
  const total = useRef(0);

  const onCommit = () => {
    if (startedAt.current) {
      total.current += performance.now() - startedAt.current;
      startedAt.current = 0;
    }
  };

  const applyFix = (enabled: boolean) => {
    setFixEnabled(enabled);
    setFix(enabled);
  };

  const measure = async (scenario: (typeof SCENARIOS)[number]): Promise<Result> => {
    applyFix(scenario.fix);
    setMode(scenario.mode);
    await nextFrame();
    await nextFrame();
    total.current = 0;
    resolveCounter.count = 0;
    for (let i = 0; i < RENDERS; i++) {
      startedAt.current = performance.now();
      setTick((t) => t + 1);
      await nextFrame();
      await nextFrame();
    }
    return { ms: total.current / RENDERS, resolves: resolveCounter.count / RENDERS };
  };

  const run = async () => {
    setRunning(true);
    setSelected(false);
    const next: Partial<Record<ScenarioId, Result>> = {};
    for (const scenario of SCENARIOS) {
      next[scenario.id] = await measure(scenario);
      setResults({ ...next });
    }
    applyFix(false);
    setMode('data');
    setRunning(false);
    console.log(
      `[repro] ${SCENARIOS.map((s) => `${s.id} ${next[s.id]!.ms.toFixed(1)} ms, ${next[s.id]!.resolves.toFixed(0)} resolves`).join(' | ')}`,
    );
  };

  return (
    <ScrollView className='flex-1 bg-white' contentContainerClassName='px-4 pt-16 pb-10 gap-4'>
      <Text className='text-xl font-bold'>Uniwind: data-[] styles are never cached</Text>
      <Text className='text-gray-700'>
        Uniwind caches the styles it resolves for each class string. A string containing a
        data-[] variant is never cached, so it is parsed again on every render. The fix adds
        the data-* prop values to the cache key instead.
      </Text>

      <View className='gap-2'>
        <Text className='text-lg font-bold'>1. Speed</Text>
        <Text className='text-gray-700'>
          Re-renders the {CELLS} squares below {RENDERS} times with unchanged props, once for
          each row.
        </Text>
        <Pressable
          testID='run'
          disabled={running}
          onPress={run}
          className='bg-black rounded-lg p-3 items-center'
        >
          <Text className='text-white font-bold'>{running ? 'Measuring…' : 'Run comparison'}</Text>
        </Pressable>
        <View className='border border-gray-300 rounded-lg'>
          <View className='flex-row p-2 bg-gray-100 rounded-t-lg'>
            <Text className='flex-1 font-bold'>Class string</Text>
            <Text className='w-20 text-right font-bold'>ms/render</Text>
            <Text className='w-24 text-right font-bold'>re-parses</Text>
          </View>
          {SCENARIOS.map((scenario) => {
            const result = results[scenario.id];
            return (
              <View key={scenario.id} className='flex-row p-2 border-t border-gray-200'>
                <Text className='flex-1'>{scenario.label}</Text>
                <Text testID={`${scenario.id}-ms`} className='w-20 text-right'>
                  {result ? result.ms.toFixed(1) : '–'}
                </Text>
                <Text testID={`${scenario.id}-resolves`} className='w-24 text-right'>
                  {result ? result.resolves.toFixed(0) : '–'}
                </Text>
              </View>
            );
          })}
        </View>
        <Text className='text-gray-500 text-sm'>
          Re-parses counts the class strings Uniwind had to resolve per render because its cache
          missed. With {CELLS} squares, {CELLS} means none were cached.
        </Text>
      </View>

      <View className='gap-2'>
        <Text className='text-lg font-bold'>2. The fix still applies data-[] styles</Text>
        <Text className='text-gray-700'>
          Turn on data-selected and every other square should turn dark. Turn it off and they
          should all go back. This works the same with or without the fix.
        </Text>
        <Toggle testID='fix' label='Fix' value={fix} disabled={running} onChange={applyFix} />
        <Toggle
          testID='selected'
          label='data-selected on every other square'
          value={selected}
          disabled={running}
          onChange={(value) => {
            setMode('data');
            setSelected(value);
          }}
        />
      </View>

      <Grid mode={mode} selected={selected} onCommit={onCommit} />
    </ScrollView>
  );
}
