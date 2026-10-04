import './style.css';
import { setLanguage } from './i18n';
import * as local from './local';
import { takeInviteFromUrl } from './screens/common';
import { boardScreen } from './screens/board';
import { joinScreen } from './screens/forms';
import { homeScreen } from './screens/home';

setLanguage(local.get().lang);

function openInvite(invite: { name: string; password: string }) {
  if (local.findBoard(invite.name)?.password === invite.password) boardScreen(invite.name);
  else joinScreen(invite);
}

const invite = takeInviteFromUrl();
if (invite) openInvite(invite);
else homeScreen();

// Opening an invite link while the app is already open only changes the hash.
window.addEventListener('hashchange', () => {
  const next = takeInviteFromUrl();
  if (next) openInvite(next);
});
