import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import { type BridgeProviderId, PROVIDER_IDS } from "@/config";
import type { PermissionMode } from "@/features/domain";

export type LaunchMode = "agent" | "conversation";

export type LaunchSelection = {
  readonly mode: LaunchMode;
  readonly repoPath: string;
  readonly provider: BridgeProviderId;
  readonly permissionMode: PermissionMode;
  readonly fresh: boolean;
  readonly task: string;
};

type LaunchPanelProps = {
  readonly initial: LaunchSelection;
  readonly notice?: string;
  readonly onSelect: (selection: LaunchSelection) => void;
  readonly onCancel: () => void;
};

const PERMISSION_MODES: readonly PermissionMode[] = ["read-only", "auto"];
const MODES: readonly LaunchMode[] = ["agent", "conversation"];
const FIELD_COUNT = 7;

const nextValue = <Value extends string>(
  values: readonly Value[],
  current: Value,
  direction: -1 | 1,
): Value => {
  const currentIndex = values.indexOf(current);
  const nextIndex = (currentIndex + direction + values.length) % values.length;
  const value = values[nextIndex];
  if (value === undefined) return current;
  return value;
};

export type EditableText = {
  readonly value: string;
  readonly cursor: number;
};

export const editTextAtCursor = (
  current: EditableText,
  input: string,
  key: { readonly backspace?: boolean; readonly delete?: boolean },
): EditableText => {
  if (key.backspace && current.cursor > 0) {
    return {
      value: `${current.value.slice(0, current.cursor - 1)}${current.value.slice(current.cursor)}`,
      cursor: current.cursor - 1,
    };
  }
  if (key.delete && current.cursor < current.value.length) {
    return {
      value: `${current.value.slice(0, current.cursor)}${current.value.slice(current.cursor + 1)}`,
      cursor: current.cursor,
    };
  }
  if (input.length === 0) return current;
  return {
    value: `${current.value.slice(0, current.cursor)}${input}${current.value.slice(current.cursor)}`,
    cursor: current.cursor + input.length,
  };
};

const rowColor = (selected: boolean): "cyan" | undefined => {
  if (selected) return "cyan";
  return undefined;
};

const EditableRow = (props: {
  readonly label: string;
  readonly value: string;
  readonly cursor: number;
  readonly selected: boolean;
}) => {
  if (!props.selected) {
    return (
      <Text>
        {"  "}
        {props.label}: {props.value}
      </Text>
    );
  }
  const cursorCharacter = props.value[props.cursor];
  const visibleCursor = cursorCharacter === undefined ? " " : cursorCharacter;
  const suffixStart = cursorCharacter === undefined ? props.cursor : props.cursor + 1;
  return (
    <Text color="cyan">
      › {props.label}: {props.value.slice(0, props.cursor)}
      <Text inverse>{visibleCursor}</Text>
      {props.value.slice(suffixStart)}
    </Text>
  );
};

export const LaunchPanel = (props: LaunchPanelProps) => {
  const { exit } = useApp();
  const [selection, setSelection] = useState(props.initial);
  const [field, setField] = useState(0);
  const [repoCursor, setRepoCursor] = useState(props.initial.repoPath.length);
  const [taskCursor, setTaskCursor] = useState(props.initial.task.length);

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel();
      exit();
      return;
    }
    if (key.tab || key.downArrow) {
      setField((current) => (current + 1) % FIELD_COUNT);
      return;
    }
    if (key.upArrow) {
      setField((current) => (current - 1 + FIELD_COUNT) % FIELD_COUNT);
      return;
    }
    if (field === 1 && key.leftArrow) {
      setRepoCursor((current) => Math.max(0, current - 1));
      return;
    }
    if (field === 1 && key.rightArrow) {
      setRepoCursor((current) => Math.min(selection.repoPath.length, current + 1));
      return;
    }
    if (field === 5 && selection.mode === "agent" && key.leftArrow) {
      setTaskCursor((current) => Math.max(0, current - 1));
      return;
    }
    if (field === 5 && selection.mode === "agent" && key.rightArrow) {
      setTaskCursor((current) => Math.min(selection.task.length, current + 1));
      return;
    }
    const direction = key.leftArrow ? -1 : key.rightArrow ? 1 : undefined;
    if (direction !== undefined && field === 0) {
      setSelection((current) => ({
        ...current,
        mode: nextValue(MODES, current.mode, direction),
      }));
      return;
    }
    if (direction !== undefined && field === 2) {
      setSelection((current) => ({
        ...current,
        provider: nextValue(PROVIDER_IDS, current.provider, direction),
      }));
      return;
    }
    if (direction !== undefined && field === 3) {
      setSelection((current) => ({
        ...current,
        permissionMode: nextValue(PERMISSION_MODES, current.permissionMode, direction),
      }));
      return;
    }
    if ((direction !== undefined || input === " ") && field === 4) {
      setSelection((current) => ({ ...current, fresh: !current.fresh }));
      return;
    }
    if (key.ctrl && input === "a" && (field === 1 || field === 5)) {
      if (field === 1) {
        setSelection((current) => ({ ...current, repoPath: "" }));
        setRepoCursor(0);
      } else {
        setSelection((current) => ({ ...current, task: "" }));
        setTaskCursor(0);
      }
      return;
    }
    if (field === 1) {
      const edited = editTextAtCursor(
        { value: selection.repoPath, cursor: repoCursor },
        input,
        key,
      );
      setSelection((current) => ({ ...current, repoPath: edited.value }));
      setRepoCursor(edited.cursor);
      return;
    }
    if (field === 5 && selection.mode === "agent") {
      const edited = editTextAtCursor({ value: selection.task, cursor: taskCursor }, input, key);
      setSelection((current) => ({ ...current, task: edited.value }));
      setTaskCursor(edited.cursor);
      return;
    }
    if (key.return && field === 6) {
      if (selection.repoPath.trim().length === 0) return;
      if (selection.mode === "agent" && selection.task.trim().length === 0) return;
      props.onSelect(selection);
      exit();
    }
  });

  const agentTask = selection.mode === "agent" ? selection.task : "(not used in Conversation mode)";
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        ai-browser-bridge launcher
      </Text>
      <Text dimColor>Use ↑/↓ or Tab to move, ←/→ to choose or move the text cursor.</Text>
      {props.notice === undefined ? null : <Text color="green">Last task: {props.notice}</Text>}
      <Text> </Text>
      <Text color={rowColor(field === 0)}>
        {field === 0 ? "›" : " "} Mode: {selection.mode}
      </Text>
      <EditableRow
        label="Repo"
        value={selection.repoPath}
        cursor={repoCursor}
        selected={field === 1}
      />
      <Text color={rowColor(field === 2)}>
        {field === 2 ? "›" : " "} Provider: {selection.provider}
      </Text>
      <Text color={rowColor(field === 3)}>
        {field === 3 ? "›" : " "} Permissions: {selection.permissionMode}
      </Text>
      <Text color={rowColor(field === 4)}>
        {field === 4 ? "›" : " "} New Conversation: {selection.fresh ? "yes" : "no"}
      </Text>
      <EditableRow
        label="Task"
        value={agentTask}
        cursor={taskCursor}
        selected={field === 5 && selection.mode === "agent"}
      />
      <Text color={rowColor(field === 6)} bold={field === 6}>
        {field === 6 ? "›" : " "} Start
      </Text>
      <Text> </Text>
      <Text dimColor>
        Esc cancels. Settings are saved in the selected repo's .bridge/config.json.
      </Text>
    </Box>
  );
};
