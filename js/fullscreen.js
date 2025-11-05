/* === Controle de fullscreen + trava landscape quando possível === */
const overlay = document.getElementById("fullscreen-overlay");
const exitBtn = document.getElementById("exit-fullscreen-btn");

async function enterFullscreen() {
  const el = document.documentElement; // tela cheia no documento

  // entrar em fullscreen
  if (el.requestFullscreen) await el.requestFullscreen();
  else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  else if (el.msRequestFullscreen) await el.msRequestFullscreen();

  overlay.style.display = "none"; // remove overlay

  // ✅ Tenta travar landscape (somente Android / PWA / Chrome)
  if (screen.orientation && screen.orientation.lock) {
    try {
      await screen.orientation.lock("landscape");
      console.log("🔒 Landscape travado.");
    } catch (e) {
      console.warn("⚠️ Não foi possível travar orientação:", e);
    }
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if (document.msExitFullscreen) document.msExitFullscreen();
}

overlay.addEventListener("click", enterFullscreen);
exitBtn.addEventListener("click", exitFullscreen);

document.addEventListener("fullscreenchange", () => {
  // se saiu do fullscreen, volta o overlay
  if (!document.fullscreenElement) {
    overlay.style.display = "flex";

    // desbloqueia orientação quando sair
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
      console.log("🔓 Orientação desbloqueada.");
    }
  }
});

