// External scanner of tree-sitter-slide: tag names (ordinary or raw) and the raw content of raw tags.
#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <string.h>
#include <wctype.h>

enum { TAG_NAME, RAW_TAG_NAME, RAW_TEXT };

#define MAX_NAME 16

typedef struct {
  char name[MAX_NAME]; // the raw tag that is open
} Scanner;

static const char *RAW[] = { "code", "c", "tex", "chart", "diagram", "notes", "slide", "frame", NULL };

static bool is_raw(const char *name) {
  for (int i = 0; RAW[i]; i++) if (strcmp(RAW[i], name) == 0) return true;
  return false;
}

void *tree_sitter_slide_external_scanner_create() { return calloc(1, sizeof(Scanner)); }
void tree_sitter_slide_external_scanner_destroy(void *p) { free(p); }
unsigned tree_sitter_slide_external_scanner_serialize(void *p, char *buf) {
  Scanner *s = p;
  size_t n = strlen(s->name);
  memcpy(buf, s->name, n);
  return n;
}
void tree_sitter_slide_external_scanner_deserialize(void *p, const char *buf, unsigned n) {
  Scanner *s = p;
  memset(s->name, 0, MAX_NAME);
  if (n > 0 && n < MAX_NAME) memcpy(s->name, buf, n);
}

static bool name_char(int32_t c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-'; }

bool tree_sitter_slide_external_scanner_scan(void *p, TSLexer *lexer, const bool *valid) {
  Scanner *s = p;

  // the content of a raw tag: everything up to its closing tag (an escaped \</code> does not close it)
  if (valid[RAW_TEXT] && s->name[0]) {
    // a <code> that holds <frame>s is parsed as an ordinary element
    if (strcmp(s->name, "code") == 0) {
      while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);
      if (lexer->lookahead == '<') {
        lexer->mark_end(lexer);
        lexer->advance(lexer, false);
        const char *f = "frame";
        int i = 0;
        while (f[i] && lexer->lookahead == f[i]) { lexer->advance(lexer, false); i++; }
        if (!f[i]) return false;
      }
    }
    bool any = false;
    lexer->mark_end(lexer);
    for (;;) {
      if (lexer->eof(lexer)) break;
      if (lexer->lookahead == '\\') {
        lexer->advance(lexer, false);
        any = true;
        if (lexer->lookahead == '<') { lexer->advance(lexer, false); }
        lexer->mark_end(lexer);
        continue;
      }
      if (lexer->lookahead == '<') {
        // is it </name> ?
        lexer->mark_end(lexer);
        lexer->advance(lexer, false);
        if (lexer->lookahead == '/') {
          lexer->advance(lexer, false);
          size_t i = 0;
          size_t n = strlen(s->name);
          while (i < n && lexer->lookahead == s->name[i]) { lexer->advance(lexer, false); i++; }
          if (i == n && lexer->lookahead == '>') {
            lexer->result_symbol = RAW_TEXT;
            return any;
          }
        }
        any = true;
        lexer->mark_end(lexer);
        continue;
      }
      lexer->advance(lexer, false);
      any = true;
      lexer->mark_end(lexer);
    }
    lexer->result_symbol = RAW_TEXT;
    return any;
  }

  // a tag name right after `<` or `</`
  if ((valid[TAG_NAME] || valid[RAW_TAG_NAME]) && name_char(lexer->lookahead) && !(lexer->lookahead >= '0' && lexer->lookahead <= '9')) {
    char name[MAX_NAME] = {0};
    size_t n = 0;
    while (name_char(lexer->lookahead)) {
      if (n < MAX_NAME - 1) name[n++] = (char)lexer->lookahead;
      lexer->advance(lexer, false);
    }
    if (is_raw(name) && valid[RAW_TAG_NAME]) {
      // the name of the tag that opens: its content runs to the matching closing tag
      memcpy(s->name, name, MAX_NAME);
      lexer->result_symbol = RAW_TAG_NAME;
      return true;
    }
    if (valid[TAG_NAME]) { lexer->result_symbol = TAG_NAME; return true; }
  }
  return false;
}
