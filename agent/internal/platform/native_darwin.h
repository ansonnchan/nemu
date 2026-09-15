#include <stdlib.h>
char *nemu_sample(void);
void nemu_init(void);
int nemu_pump(void);
void nemu_status(const char *text);
char *nemu_secret_read(const char *key);
int nemu_secret_write(const char *key,const char *value);
void nemu_open(const char *url);
