" Vim syntax for .slides files (slideit, KDL): nodes, properties, flags, strings, raw strings, comments
if exists('b:current_syntax') | finish | endif

syntax match slidesComment /\/\/.*$/
syntax region slidesComment start=/\/\*/ end=/\*\//
syntax match slidesSlashdash /\/-/

" strings: raw multi-line, raw, multi-line, plain
syntax region slidesRaw start=/#\+"""/ end=/"""#\+/
syntax region slidesRaw start=/#\+"/ end=/"#\+/ oneline
syntax region slidesString start=/"""/ end=/"""/ contains=slidesEscape,slidesBold,slidesCode
syntax region slidesString start=/"/ skip=/\\"/ end=/"/ oneline contains=slidesEscape,slidesBold,slidesCode
syntax match slidesEscape /\\[nrt\\"\/bf]/ contained
syntax match slidesBold /\*\*[^*]\+\*\*/ contained
syntax match slidesCode /`[^`]\+`/ contained

syntax match slidesNumber /\<-\?\d[0-9_]*\(\.\d\+\)\?\>/
syntax match slidesConst /#\(true\|false\|null\|inf\|-inf\|nan\)\>/
syntax match slidesProp /[A-Za-z_-][A-Za-z0-9_.-]*\ze=/
" a node name: the first word of a statement
syntax match slidesNode /\(^\s*\|[{;]\s*\)\@<=\(-\|[A-Za-z_][A-Za-z0-9_.-]*\)/

highlight default link slidesComment Comment
highlight default link slidesSlashdash Special
highlight default link slidesRaw String
highlight default link slidesString String
highlight default link slidesEscape SpecialChar
highlight default link slidesBold Type
highlight default link slidesCode Special
highlight default link slidesNumber Number
highlight default link slidesConst Constant
highlight default link slidesProp Identifier
highlight default link slidesNode Function

let b:current_syntax = 'slides'
