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
    private final String testUserEmail;
    private final String testUserPassword;

    public TestConfig() {
        loadProperties();

        this.baseUrl = getPropertyOrEnv("baseUrl", "BASE_URL", "http://localhost:5173");
        this.headless = Boolean.parseBoolean(getPropertyOrEnv("headless", "HEADLESS", "false"));
        this.processingTimeoutSeconds = Integer.parseInt(getPropertyOrEnv("processingTimeout", "PROCESSING_TIMEOUT", "120"));
        this.testResourcesDir = getPropertyOrEnv("testResourcesDir", "TEST_RESOURCES_DIR", "src/test/resources/documents/");
        this.testUserEmail = getPropertyOrEnv("testUserEmail", "TEST_USER_EMAIL", "");
        this.testUserPassword = getPropertyOrEnv("testUserPassword", "TEST_USER_PASSWORD", "");
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

    private String getPropertyOrEnv(String key, String envVar, String defaultValue) {
        String systemProp = System.getProperty(key);
        if (systemProp != null && !systemProp.trim().isEmpty()) {
            return systemProp.trim();
        }
        if (envVar != null) {
            String envVal = System.getenv(envVar);
            if (envVal != null && !envVal.trim().isEmpty()) {
                return envVal.trim();
            }
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

    public String getTestUserEmail() {
        return testUserEmail;
    }

    public String getTestUserPassword() {
        return testUserPassword;
    }
}
