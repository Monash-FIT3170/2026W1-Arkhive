package com.arkhive.utils;

import com.arkhive.config.TestConfig;

import java.io.File;
import java.net.URL;

/**
 * Utility for resolving test data files from the configured test resources directory into absolute file paths.
 */
public class TestFileUtils {

    private final TestConfig testConfig;

    public TestFileUtils(TestConfig testConfig) {
        this.testConfig = testConfig != null ? testConfig : new TestConfig();
    }

    public TestFileUtils() {
        this(new TestConfig());
    }

    public String getTestFilePath(String fileName) {
        try {
            // First attempt: resolve using configured testResourcesDir property
            String dirPath = testConfig.getTestResourcesDir();
            File file = new File(dirPath, fileName);
            if (file.exists()) {
                return file.getAbsolutePath();
            }

            // Fallback attempt: resolve via ClassLoader resource URI
            URL resource = getClass()
                    .getClassLoader()
                    .getResource("documents/" + fileName);

            if (resource != null) {
                return new File(resource.toURI()).getAbsolutePath();
            }
        } catch (Exception e) {
            throw new RuntimeException("Could not load test file: " + fileName, e);
        }

        throw new RuntimeException("Test file not found: " + fileName + " in " + testConfig.getTestResourcesDir());
    }
}
