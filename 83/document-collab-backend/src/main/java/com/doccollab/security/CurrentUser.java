package com.doccollab.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CurrentUser {

    private String userId;

    private String tenantId;

    private String username;

    private String email;

    private String role;

    private static final ThreadLocal<CurrentUser> context = new ThreadLocal<>();

    public static void set(CurrentUser user) {
        context.set(user);
    }

    public static CurrentUser get() {
        return context.get();
    }

    public static void clear() {
        context.remove();
    }
}
