from tools.client_contract import render_typescript


def test_wire_types_preserve_required_nullable_and_literal_values():
    schema = {"components": {"schemas": {"Example": {
        "type": "object", "required": ["id", "content", "status"],
        "properties": {
            "id": {"type": "integer"},
            "content": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            "status": {"enum": ["todo", "completed"]},
            "tags": {"type": "array", "items": {"type": "string"}},
        },
    }}}}
    rendered = render_typescript(schema)
    assert '"id": number;' in rendered
    assert '"content": string | null;' in rendered
    assert '"status": "todo" | "completed";' in rendered
    assert '"tags"?: Array<string>;' in rendered


def test_wire_types_resolve_references_and_dictionary_values():
    schema = {"components": {"schemas": {
        "Example": {"type": "object", "properties": {
            "values": {"type": "object", "additionalProperties": {"$ref": "#/components/schemas/Item"}},
        }},
        "Item": {"type": "string"},
    }}}
    assert '"values"?: Record<string, Item>;' in render_typescript(schema)
