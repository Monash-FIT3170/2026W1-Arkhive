package com.arkhive.utils;

import java.io.File;
import java.net.URL;

/**
 * Utility for resolving test data files from the test resources directory into absolute file paths.
 */
public class TestFileUtils {

    public String getTestFilePath(String fileName) {
        try {
            URL resource = getClass()
                    .getClassLoader()
                    .getResource("documents/" + fileName);

            if (resource != null) {
                return new File(resource.toURI()).getAbsolutePath();
            }
        } catch (Exception e) {
            throw new RuntimeException("Could not load test file: " + fileName, e);
        }

        throw new RuntimeException("Test file not found: " + fileName);
    }
}
