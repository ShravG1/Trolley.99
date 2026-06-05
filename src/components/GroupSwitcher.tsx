import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, PlusIcon } from './icons';
import type { MyGroup } from '@/types/models';

// Multi-group switcher (§12). Lists every group you're in (tap to switch — the
// sync layer re-scopes its channels to the new group), plus a route into the
// create/join-another flow. Reads/writes the active group through the store.
export function GroupSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const pushToast = useStore((s) => s.pushToast);

  function switchTo(g: MyGroup) {
    if (g.group_id !== activeGroupId) {
      setActiveGroup(g.group_id);
      pushToast(`Switched to ${g.name}`);
    }
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Your lists">
      <ul className="divide-y divide-line">
        {groups.map((g) => {
          const active = g.group_id === activeGroupId;
          return (
            <li key={g.group_id}>
              <button
                onClick={() => switchTo(g)}
                className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
                aria-current={active ? 'true' : undefined}
              >
                <span className="flex flex-col">
                  <span className="text-item font-semibold text-ink">{g.name}</span>
                  <span className="text-meta text-ink-faint">as {g.display_name}</span>
                </span>
                {active && <CheckIcon className="shrink-0 text-brand" />}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => {
          onClose();
          navigate('/groups/new');
        }}
        className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-pill border border-line px-4 text-item font-semibold text-ink hover:bg-surface-2"
      >
        <PlusIcon className="text-brand" size={20} /> Create or join another
      </button>
    </BottomSheet>
  );
}
