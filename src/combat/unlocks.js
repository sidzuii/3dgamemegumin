/**
 * Which skills the story has opened for Megumin (docs/combat/04 §1). Roxy knows her whole set from the moment she
 * joins. The flags are set by the training (data/quests.js, data/story/combat.js); progress that already went further
 * (older saves) opens them as well, so nobody is locked out.
 *   M_Q  Проламывающий выпад — the end of Bran's practice (guild_test, stage 'staff' done)
 *   M_E  Круговой отбив      — after the first delivered contract (a short exercise at the dummies)
 *   M_F  Алый пролом         — after rank E (Bran's extra lesson, scene CB01)
 */
export function lockedReason(rpg, heroId, specId) {
  if (!rpg || heroId !== 'megumin') return '';
  const F = rpg.state.flags;
  const Q = rpg.state.quests;
  const st = (id) => Q[id]?.status;
  switch (specId) {
    case 'M_Q':
      return F.skill_M_Q || st('guild_test') === 'done' || ['bran2', 'magic', 'report'].includes(rpg.quests.stageId('guild_test')) ? '' : 'Выпад покажет Бран';
    case 'M_E':
      return F.skill_M_E || st('ch1_name') ? '' : 'Отбив — после первого заказа';
    case 'M_F':
      return F.skill_M_F || st('ch1_name') === 'done' ? '' : 'Пролом — после ранга E';
    default:
      return '';
  }
}
