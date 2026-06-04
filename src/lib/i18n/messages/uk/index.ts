// Український словник. Типізований як Messages — компілятор вимагає, щоб усі
// ключі збігалися з еталонним (російським) словником.

import type { Messages } from '../index';

import { common } from './common';
import { enums } from './enums';
import { nav } from './nav';
import { topbar } from './topbar';
import { auth } from './auth';
import { errors } from './errors';
import { account } from './account';
import { settings } from './settings';
import { commandPalette } from './commandPalette';

import { dashboard } from './dashboard';
import { clients } from './clients';
import { cases } from './cases';
import { caseCard } from './caseCard';
import { tasks } from './tasks';
import { calendar } from './calendar';
import { documents } from './documents';
import { payments } from './payments';
import { payroll } from './payroll';
import { payrollPrint } from './payrollPrint';
import { users } from './users';
import { help } from './help';
import { activity } from './activity';
import { ui } from './ui';

export const uk: Messages = {
  common,
  enums,
  nav,
  topbar,
  auth,
  errors,
  account,
  settings,
  commandPalette,
  dashboard,
  clients,
  cases,
  caseCard,
  tasks,
  calendar,
  documents,
  payments,
  payroll,
  payrollPrint,
  users,
  help,
  activity,
  ui,
};
