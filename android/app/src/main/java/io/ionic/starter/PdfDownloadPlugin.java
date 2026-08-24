package io.ionic.starter;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "PdfDownload")
public class PdfDownloadPlugin extends Plugin {

    // ✅ NEW: dedicated channel for download-complete notifications
    private static final String CHANNEL_ID = "pdf_downloads";
    private static final String CHANNEL_NAME = "PDF Downloads";
    private static int notificationIdCounter = 1000;

    @PluginMethod
    public void savePdf(PluginCall call) {

        String fileName = call.getString("fileName");
        String base64Data = call.getString("data");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("PDF file name is required");
            return;
        }

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("PDF data is empty");
            return;
        }

        try {

            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }

            byte[] pdfBytes = Base64.decode(base64Data, Base64.DEFAULT);

            if (pdfBytes.length == 0) {
                call.reject("PDF data is empty after decoding");
                return;
            }

            ContentResolver resolver = getContext().getContentResolver();

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
            }

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

            if (uri == null) {
                call.reject("Unable to create PDF");
                return;
            }

            OutputStream outputStream = null;

            try {
                outputStream = resolver.openOutputStream(uri);

                if (outputStream == null) {
                    resolver.delete(uri, null, null);
                    call.reject("Unable to open PDF");
                    return;
                }

                outputStream.write(pdfBytes);
                outputStream.flush();

            } finally {
                if (outputStream != null) {
                    outputStream.close();
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues completedValues = new ContentValues();
                completedValues.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, completedValues, null, null);
            }

            // ✅ NEW: fire the Android status-bar "Download complete" notification,
            // tapping it opens the PDF (same UX as Chrome/other apps' downloads)
            showDownloadNotification(fileName, uri);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("fileName", fileName);
            result.put("uri", uri.toString());

            call.resolve(result);

        } catch (Exception e) {

            e.printStackTrace();

            String message = e.getMessage() != null ? e.getMessage() : "Unable to download PDF";
            call.reject(message);
        }
    }

    // ============================================================
    // ✅ NEW: shows the system notification for a completed download
    // ============================================================
    private void showDownloadNotification(String fileName, Uri fileUri) {

        Context context = getContext();

        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager == null) {
            return;
        }

        // Android 8+ requires a notification channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = notificationManager.getNotificationChannel(CHANNEL_ID);

            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("Notifications for completed PDF downloads");
                notificationManager.createNotificationChannel(channel);
            }
        }

        // Intent to open the file when the notification is tapped
        Intent openIntent = new Intent(Intent.ACTION_VIEW);
        openIntent.setDataAndType(fileUri, "application/pdf");
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        openIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                notificationIdCounter,
                openIntent,
                pendingIntentFlags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Download complete")
                .setContentText(fileName)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        notificationManager.notify(notificationIdCounter++, builder.build());
    }
}