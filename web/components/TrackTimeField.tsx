'use client';

import { useEffect, useRef, useState } from 'react';
import { formatHMSTime } from '@maxmellon/cue-parser';
import type { HMSTime } from '@maxmellon/cue-parser';
import { parseTimeInput } from '@/utils/track';

/**
 * トラックの開始時刻 (INDEX 01) の入力欄。
 *
 * 入力途中の "1:3" のような文字列を弾かずに持っておきたいので、
 * 表示用の文字列はこの中で抱え、読める形になったときだけ親へ返す。
 * オフセット欄 (CueParser の offsetText) と同じ作法。
 */
export default function TrackTimeField({
  id,
  value,
  ariaLabel,
  onCommit,
}: {
  id: string;
  value: HMSTime;
  ariaLabel: string;
  onCommit: (time: HMSTime) => void;
}) {
  const formatted = formatHMSTime(value);
  const [draft, setDraft] = useState(formatted);
  const [invalid, setInvalid] = useState(false);
  const isFocusedRef = useRef(false);

  // オフセットの変更や並び替えで外から時刻が変わったら追従する。
  // ただし入力中に書き換えるとカーソルが飛ぶので、そのときは触らない
  useEffect(() => {
    if (isFocusedRef.current) return;
    setDraft(formatted);
    setInvalid(false);
  }, [formatted]);

  const handleChange = (raw: string) => {
    setDraft(raw);

    const parsed = parseTimeInput(raw);
    if (parsed === null) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onCommit(parsed);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        // 入力途中の表記("90" など)を HH:MM:SS に戻す。読めない文字列は直前の値に戻る
        isFocusedRef.current = false;
        setDraft(formatted);
        setInvalid(false);
      }}
      placeholder="00:00:00"
      aria-label={ariaLabel}
      aria-invalid={invalid}
      className="field field-mono"
    />
  );
}
