import type { ActionStatusVariant } from '../components/ActionStatusDialog';

export type DailyLogActionNotice = {
  variant: ActionStatusVariant;
  title: string;
  message: string;
};

export function dailyLogSavingNotice(editing: boolean): DailyLogActionNotice {
  return {
    variant: 'loading',
    title: 'Tallennetaan',
    message: editing
      ? 'Työkirjauksen muutoksia tallennetaan…'
      : 'Uutta työkirjausta tallennetaan…',
  };
}

export function dailyLogSavedNotice(editing: boolean): DailyLogActionNotice {
  return {
    variant: 'success',
    title: 'Tallennettu',
    message: editing ? 'Työkirjauksen muutokset tallennettiin.' : 'Työkirjaus lisättiin työraportille.',
  };
}

export function dailyLogNoticeFromError(message: string, title = 'Tallennus epäonnistui'): DailyLogActionNotice {
  return { variant: 'error', title, message };
}

export function dailyLogNoticeFromWarning(message: string, title = 'Huomio'): DailyLogActionNotice {
  return { variant: 'warning', title, message };
}
