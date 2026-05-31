package com.doccollab.annotation;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AuditLog {
    String operation() default "";
    String module() default "";
    boolean recordParams() default true;
    boolean recordResult() default false;
}
