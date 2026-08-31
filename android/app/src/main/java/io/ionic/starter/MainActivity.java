package io.ionic.starter;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.graphics.Color;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.ionicframework.capacitor.Checkout;

public class MainActivity extends BridgeActivity {

    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {

        // IMPORTANT:
        // Custom Capacitor plugins MUST be registered
        // before BridgeActivity.onCreate().
        registerPlugin(PdfDownloadPlugin.class);
        registerPlugin(Checkout.class);

        super.onCreate(savedInstanceState);

        // ⚠️ TEMPORARILY COMMENTED — screenshot घेण्यासाठी disable केलंय.
        // Testing झाल्यावर परत UNCOMMENT करायला विसरू नका (security साठी
        // हे production मध्ये असणं गरजेचं आहे).
        // getWindow().setFlags(
        //         WindowManager.LayoutParams.FLAG_SECURE,
        //         WindowManager.LayoutParams.FLAG_SECURE
        // );

        // ✅ NEW: Android 15 (API 35) edge-to-edge display मुळे
        // styles.xml cha android:navigationBarColor कधी कधी ignore
        // होतो — म्हणून runtime मध्ये explicitly navigation bar cha
        // color set करतो (splash cha teal color सोबत match).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            getWindow().setNavigationBarColor(Color.parseColor("#087b76"));
        }

        // ✅ NEW: request POST_NOTIFICATIONS at runtime on Android 13+
        // (required for the PDF download-complete notification to actually show)
        requestNotificationPermissionIfNeeded();
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {

                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST_CODE
                );
            }
        }
    }
}