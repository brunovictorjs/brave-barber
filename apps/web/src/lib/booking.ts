/** Profissional escolhido no perfil público: a etapa "Com quem?" já vem com ele marcado. */
export const PREFERRED_BARBER_KEY = 'bb:preferred-barber';

export function preferBarber(id: string) {
  try {
    window.sessionStorage.setItem(PREFERRED_BARBER_KEY, id);
  } catch {
    /* navegação privada sem storage: segue sem preferência */
  }
}
