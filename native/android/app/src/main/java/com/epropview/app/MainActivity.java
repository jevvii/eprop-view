package com.epropview.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.epropview.app.plugins.ARBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ARBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
