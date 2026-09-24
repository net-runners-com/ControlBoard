/* 権限とサイト設定の両方で、出してよい画面だけを残す。 */
export const visibleSections = (sections, modules, perms) =>
  sections.filter((s) => (!s.need || perms.includes(s.need)) && (!s.module || modules[s.module]));
