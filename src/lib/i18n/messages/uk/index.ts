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
import { departments } from './departments';
import { commandPalette } from './commandPalette';

import { dashboard } from './dashboard';
import { clients } from './clients';
import { cases } from './cases';
import { caseCard } from './caseCard';
import { tasks } from './tasks';
import { comments } from './comments';
import { calendar } from './calendar';
import { absences } from './absences';
import { cash } from './cash';
import { documents } from './documents';
import { acts } from './acts';
import { requisites } from './requisites';
import { payments } from './payments';
import { payroll } from './payroll';
import { payrollPrint } from './payrollPrint';
import { users } from './users';
import { help } from './help';
import { helpCases } from './helpCases';
import { helpClients } from './helpClients';
import { helpMoney } from './helpMoney';
import { helpNav } from './helpNav';
import { helpPayroll } from './helpPayroll';
import { helpRoles } from './helpRoles';
import { helpStart } from './helpStart';
import { helpStages } from './helpStages';
import { helpTasks } from './helpTasks';
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
  departments,
  commandPalette,
  dashboard,
  clients,
  cases,
  caseCard,
  tasks,
  comments,
  calendar,
  absences,
  cash,
  documents,
  acts,
  requisites,
  payments,
  payroll,
  payrollPrint,
  users,
  help,
  helpCases,
  helpClients,
  helpMoney,
  helpNav,
  helpPayroll,
  helpRoles,
  helpStart,
  helpStages,
  helpTasks,
  activity,
  ui,
};
