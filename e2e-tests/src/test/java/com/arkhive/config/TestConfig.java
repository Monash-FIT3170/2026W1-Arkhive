package com.arkhive.config;

import java.io.InputStream;
import java.util.Properties;

/**
 * Centralized configuration loading settings from config.properties,
 * with support for system property overrides (-Dkey=value).
 */
public class TestConfig {

    private static final String PROPERTIES_FILE = "config.properties";

    private final Properties properties = new Properties();
    private final String baseUrl;
    private final boolean headless;
    private final int processingTimeoutSeconds;
    private final String testResourcesDir;

    public TestConfig() {
        loadProperties();

        this.baseUrl = getProperty("baseUrl", "http://localhost:5173");
        this.headless = Boolean.parseBoolean(getProperty("headless", "false"));
        this.processingTimeoutSeconds = Integer.parseInt(getProperty("processingTimeout", "120"));
        this.testResourcesDir = getProperty("testResourcesDir", "src/test/resources/documents/");
    }

    private void loadProperties() {
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(PROPERTIES_FILE)) {
            if (input != null) {
                properties.load(input);
            }
        } catch (Exception e) {
            System.err.println("Warning: Could not load " + PROPERTIES_FILE + ": " + e.getMessage());
        }
    }

    private String getProperty(String key, String defaultValue) {
        String systemProp = System.getProperty(key);
        if (systemProp != null && !systemProp.trim().isEmpty()) {
            return systemProp.trim();
        }
        return properties.getProperty(key, defaultValue).trim();
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public boolean isHeadless() {
        return headless;
    }

    public int getProcessingTimeoutSeconds() {
        return processingTimeoutSeconds;
    }

    public String getTestResourcesDir() {
        return testResourcesDir;
    }
}
