package com.arkhive.reporting;

import com.aventstack.extentreports.ExtentTest;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * Lightweight, thread-safe logger that formats and records business-level test actions
 * with millisecond-precision timestamps in both ExtentReports and standard console output.
 */
public class ReportLogger {

    private static final DateTimeFormatter TIME_FORMATTER =
            DateTimeFormatter.ofPattern("HH:mm:ss.SSS");

    private static String formatMessage(String level, String message) {
        String timestamp = LocalTime.now().format(TIME_FORMATTER);
        return String.format("[%s] %-5s %s", timestamp, level, message);
    }

    public static void info(String message) {
        String formatted = formatMessage("INFO", message);
        System.out.println(formatted);
        try {
            ExtentTest test = ExtentManager.getTest();
            if (test != null) {
                test.info(formatted);
            }
        } catch (Exception ignored) {
        }
    }

    public static void pass(String message) {
        String formatted = formatMessage("PASS", message);
        System.out.println(formatted);
        try {
            ExtentTest test = ExtentManager.getTest();
            if (test != null) {
                test.pass(formatted);
            }
        } catch (Exception ignored) {
        }
    }

    public static void fail(String message) {
        String formatted = formatMessage("FAIL", message);
        System.err.println(formatted);
        try {
            ExtentTest test = ExtentManager.getTest();
            if (test != null) {
                test.fail(formatted);
            }
        } catch (Exception ignored) {
        }
    }

    public static void warn(String message) {
        String formatted = formatMessage("WARN", message);
        System.out.println(formatted);
        try {
            ExtentTest test = ExtentManager.getTest();
            if (test != null) {
                test.warning(formatted);
            }
        } catch (Exception ignored) {
        }
    }
}
