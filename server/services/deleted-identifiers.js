import {randomUUID} from 'node:crypto';
import {audit} from './security-common.js';

// Run inside the creation transaction: archived history stays on its original
// user ID, and a failed create rolls back identifier release as well.
export async function releaseDeletedIdentifiers(tx, actor, fields) {
  const identifiers = [{email: fields.email}];
  if (fields.employeeId) identifiers.push({employeeId: fields.employeeId});
  const archived = await tx.user.findMany({where: {
    companyId: actor.companyId, deletedAt: {not: null},
    status: 'DISABLED', isMainAdmin: false, OR: identifiers,
  }});
  for (const user of archived) {
    const suffix = randomUUID();
    const result = await tx.user.updateMany({where: {
      id: user.id, companyId: actor.companyId, deletedAt: {not: null},
      status: 'DISABLED', isMainAdmin: false,
      email: user.email, employeeId: user.employeeId,
    }, data: {
      email: `deleted-${suffix}@archive.invalid`, employeeId: `DELETED-${suffix}`,
    }});
    if (result.count) await audit(tx, actor, 'ACCOUNT_IDENTIFIERS_ARCHIVED', {
      originalEmail: user.email, originalEmployeeId: user.employeeId,
      historyRetained: true,
    }, user.id);
  }
}
