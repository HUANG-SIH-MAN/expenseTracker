/**
 * 類別上儲存的預設帳戶 ID：僅在仍存在於帳戶列表時視為有效。
 */
import type { CategoryItem } from '../types';

export function resolveEffectiveDefaultAccountId(
  item: CategoryItem | undefined,
  validAccountIds: ReadonlySet<string>,
): string | undefined {
  const id = item?.defaultAccountId;
  if (id != null && id !== '' && validAccountIds.has(id)) {
    return id;
  }
  return undefined;
}
