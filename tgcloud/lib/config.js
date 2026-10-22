// Konfigurasi deployment. SDK tgcloud tidak mendokumentasikan environment
// variable, jadi nilai ditaruh di sini (JANGAN commit nilai rahasia nyata ke repo publik).
export default {
  // user_id Telegram yang boleh memicu /_cron (penyapu reminder harian).
  adminIds: [],
  // true = Jalur A (tg-button di dalam sel tabel). Set setelah divalidasi lewat
  // `tgcloud run` + perangkat nyata (PRD §14.1); default Jalur B yang pasti jalan.
  clickableCells: false,
  defaultTzOffset: 420, // WIB, menit dari UTC
};
