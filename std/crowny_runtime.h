// ═══════════════════════════════════════════════════════════════
// CrownyOS C 런타임 — 한선씨 트랜스파일 대상
// 한선씨의 동적 타입을 C tagged union으로 구현
// ═══════════════════════════════════════════════════════════════
#ifndef CROWNY_RT_H
#define CROWNY_RT_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

// ─── Value 타입 태그 ───
enum VType { V_NONE=0, V_INT=1, V_FLOAT=2, V_STR=3, V_TRIT=4, V_ARR=5 };

typedef struct Value Value;
typedef struct VArr { Value *data; int len, cap; } VArr;

struct Value {
    enum VType type;
    union { int64_t i; double f; char *s; int8_t t; VArr *a; };
};

// ─── 생성자 ───
static Value v_none(void) { return (Value){.type=V_NONE}; }
static Value v_int(int64_t x) { return (Value){.type=V_INT, .i=x}; }
static Value v_float(double x) { return (Value){.type=V_FLOAT, .f=x}; }
static Value v_str(const char *s) { Value v={.type=V_STR}; v.s=strdup(s); return v; }
static Value v_trit(int8_t t) { return (Value){.type=V_TRIT, .t=t}; }

static Value v_arr_new(int cap) {
    VArr *a = malloc(sizeof(VArr));
    a->data = malloc(sizeof(Value) * (cap > 0 ? cap : 4));
    a->len = 0; a->cap = cap > 0 ? cap : 4;
    return (Value){.type=V_ARR, .a=a};
}

// ─── 배열 조작 ───
static void v_arr_push(Value *arr, Value v) {
    if (arr->type != V_ARR) return;
    VArr *a = arr->a;
    if (a->len >= a->cap) { a->cap *= 2; a->data = realloc(a->data, sizeof(Value)*a->cap); }
    a->data[a->len++] = v;
}

static Value v_arr_get(Value arr, int64_t idx) {
    if (arr.type != V_ARR || idx < 0 || idx >= arr.a->len) return v_none();
    return arr.a->data[idx];
}

static void v_arr_set(Value *arr, int64_t idx, Value v) {
    if (arr->type != V_ARR || idx < 0 || idx >= arr->a->len) return;
    arr->a->data[idx] = v;
}

static int64_t v_arr_len(Value arr) {
    if (arr.type == V_ARR) return arr.a->len;
    if (arr.type == V_STR) return (int64_t)strlen(arr.s);
    return 0;
}

// ─── 산술 ───
static Value v_add(Value a, Value b) {
    if (a.type==V_INT && b.type==V_INT) return v_int(a.i+b.i);
    if (a.type==V_FLOAT || b.type==V_FLOAT) {
        double x = a.type==V_FLOAT?a.f:(double)a.i;
        double y = b.type==V_FLOAT?b.f:(double)b.i;
        return v_float(x+y);
    }
    if (a.type==V_STR || b.type==V_STR) {
        char buf[4096];
        const char *sa = a.type==V_STR ? a.s : "";
        const char *sb = b.type==V_STR ? b.s : "";
        if (a.type==V_INT) snprintf(buf, sizeof(buf), "%lld%s", (long long)a.i, sb);
        else if (b.type==V_INT) snprintf(buf, sizeof(buf), "%s%lld", sa, (long long)b.i);
        else snprintf(buf, sizeof(buf), "%s%s", sa, sb);
        return v_str(buf);
    }
    return v_int(a.i+b.i);
}
static Value v_sub(Value a, Value b) {
    if (a.type==V_FLOAT||b.type==V_FLOAT) return v_float((a.type==V_FLOAT?a.f:(double)a.i)-(b.type==V_FLOAT?b.f:(double)b.i));
    return v_int(a.i-b.i);
}
static Value v_mul(Value a, Value b) {
    if (a.type==V_FLOAT||b.type==V_FLOAT) return v_float((a.type==V_FLOAT?a.f:(double)a.i)*(b.type==V_FLOAT?b.f:(double)b.i));
    return v_int(a.i*b.i);
}
static Value v_div(Value a, Value b) {
    double y = b.type==V_FLOAT?b.f:(double)b.i;
    if (y==0) return v_int(0);
    return v_float((a.type==V_FLOAT?a.f:(double)a.i)/y);
}
static Value v_mod(Value a, Value b) { return v_int(a.i%b.i); }

// ─── 비교 (3진) ───
static Value v_eq(Value a, Value b) {
    if (a.type==V_INT&&b.type==V_INT) return v_trit(a.i==b.i?1:-1);
    if (a.type==V_STR&&b.type==V_STR) return v_trit(strcmp(a.s,b.s)==0?1:-1);
    return v_trit(-1);
}
static Value v_gt(Value a, Value b) {
    double x=a.type==V_FLOAT?a.f:(double)a.i, y=b.type==V_FLOAT?b.f:(double)b.i;
    return v_trit(x>y?1:-1);
}
static Value v_lt(Value a, Value b) {
    double x=a.type==V_FLOAT?a.f:(double)a.i, y=b.type==V_FLOAT?b.f:(double)b.i;
    return v_trit(x<y?1:-1);
}
static Value v_not(Value a) {
    if (a.type==V_TRIT) return v_trit(a.t==1?-1:a.t==-1?1:0);
    return v_trit(-1);
}

// ─── 출력 ───
static void v_print(Value v) {
    switch(v.type) {
        case V_INT: printf("%lld\n",(long long)v.i); break;
        case V_FLOAT: printf("%g\n",v.f); break;
        case V_STR: printf("%s\n",v.s); break;
        case V_TRIT: printf("%s\n",v.t==1?"▲":v.t==0?"■":"▼"); break;
        case V_NONE: printf("없음\n"); break;
        case V_ARR: {
            printf("[");
            for(int i=0;i<v.a->len;i++) {
                if(i) printf(", ");
                Value e=v.a->data[i];
                if(e.type==V_INT) printf("%lld",(long long)e.i);
                else if(e.type==V_STR) printf("%s",e.s);
                else if(e.type==V_FLOAT) printf("%g",e.f);
            }
            printf("]\n");
            break;
        }
    }
}

// ─── 진릿값 변환 ───
static int v_truthy(Value v) {
    switch(v.type) {
        case V_TRIT: return v.t;
        case V_INT: return v.i>0?1:v.i<0?-1:0;
        case V_FLOAT: return v.f>0?1:v.f<0?-1:0;
        case V_NONE: return -1;
        default: return 1;
    }
}

// ─── 입력 ───
static Value v_readline(const char *prompt) {
    fprintf(stderr, "%s", prompt);
    fflush(stderr);
    char buf[4096];
    if (!fgets(buf, sizeof(buf), stdin)) return v_str("__EOF__");
    buf[strcspn(buf, "\n")] = 0;
    return v_str(buf);
}

#endif // CROWNY_RT_H
