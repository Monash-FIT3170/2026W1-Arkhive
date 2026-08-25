package com.arkhive.config;

/**
 * Centralized configuration for application URL, browser execution mode, and test parameters.
 */
public class TestConfig {

    private final String baseUrl;
    private final boolean headless;

    public TestConfig() {
        this.baseUrl = System.getProperty("baseUrl", "http://localhost:5173");
        this.headless = Boolean.parseBoolean(System.getProperty("headless", "false"));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public boolean isHeadless() {
        return headless;
    }
}
