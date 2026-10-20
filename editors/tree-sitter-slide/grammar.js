// tree-sitter grammar of the slide markup. The raw tags (code, c, tex, chart, diagram, notes, slide, frame) keep their content as
// `raw_text`, found by the external scanner (src/scanner.c); a <code> whose content is <frame>s is parsed as an ordinary element.
module.exports = grammar({
  name: 'slide',

  externals: ($) => [$._tag_name, $._raw_tag_name, $.raw_text],

  extras: () => [],

  rules: {
    document: ($) => repeat($._node),

    _node: ($) => choice($.element, $.raw_element, $.entity, $.text),

    element: ($) => choice(seq($.start_tag, repeat($._node), $.end_tag), $.self_closing_tag),

    raw_element: ($) => seq($.raw_start_tag, choice($.raw_text, repeat($._node)), $.raw_end_tag),

    start_tag: ($) => seq('<', alias($._tag_name, $.tag_name), repeat($._attr_part), '>'),
    self_closing_tag: ($) => seq('<', alias($._tag_name, $.tag_name), repeat($._attr_part), '/>'),
    end_tag: ($) => seq('</', alias($._tag_name, $.tag_name), optional($._space), '>'),

    raw_start_tag: ($) => seq('<', alias($._raw_tag_name, $.tag_name), repeat($._attr_part), '>'),
    raw_end_tag: ($) => seq('</', alias($._raw_tag_name, $.tag_name), optional($._space), '>'),

    _attr_part: ($) => choice($._space, $.attribute),
    _space: () => /\s+/,

    attribute: ($) => seq($.attribute_name, optional(seq('=', choice($.quoted_attribute_value, $.attribute_value)))),
    attribute_name: () => /[A-Za-z_][\w-]*/,
    attribute_value: () => /[^\s"'<>=`\/][^\s"'<>=`]*/,
    quoted_attribute_value: () => choice(/"[^"]*"/, /'[^']*'/),

    entity: () => /&(#\d+|#x[0-9a-fA-F]+|\w+);/,

    // text up to the next tag or entity
    text: () => /[^<&]+|[<&]/,
  },
});
