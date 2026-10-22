// Konfigurasi deployment. SDK tgcloud tidak mendokumentasikan environment
// variable, jadi nilai ditaruh di sini (JANGAN commit nilai rahasia nyata ke repo publik).
export default {
  // user_id Telegram yang boleh memicu /_cron (penyapu reminder harian).
  adminIds: [582589514],
  defaultTzOffset: 420, // WIB, menit dari UTC
};
