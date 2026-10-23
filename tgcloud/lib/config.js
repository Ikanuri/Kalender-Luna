// Konfigurasi deployment. SDK tgcloud tidak mendokumentasikan environment
// variable, jadi nilai ditaruh di sini (JANGAN commit nilai rahasia nyata ke repo publik).
export default {
  // user_id Telegram admin: boleh /diag, /_cron, dan memanggil endpoints/cron (dipakai reminders.yml; adminIds[0]).
  adminIds: [582589514],
  // Alamat Mini App (dicetak `tgcloud push`: https://app<id>.tgcloud.ai/). Dipakai tombol /app.
  miniAppUrl: 'https://app8956021829.tgcloud.ai/',
  defaultTzOffset: 420, // WIB, menit dari UTC
};
