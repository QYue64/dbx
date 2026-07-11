use super::dialect::{capabilities_for, dialect_label, StructureDialect};
use super::types::TableStructureSqlOptions;
use super::util::{clean, qualified_table, quote_string};

pub(super) fn build_table_charset_sql(options: &TableStructureSqlOptions, warnings: &mut Vec<String>) -> Vec<String> {
    let capabilities = capabilities_for(options.database_type);
    let dialect = capabilities.dialect;
    let new_charset = clean(options.table_charset.as_deref().unwrap_or(""));
    let original_charset = clean(options.original_table_charset.as_deref().unwrap_or(""));
    let new_collation = clean(options.table_collation.as_deref().unwrap_or(""));
    let original_collation = clean(options.original_table_collation.as_deref().unwrap_or(""));
    if new_charset == original_charset && new_collation == original_collation {
        return Vec::new();
    }
    if new_charset.is_empty() && new_collation.is_empty() {
        return Vec::new();
    }
    if dialect != StructureDialect::Mysql {
        warnings
            .push(format!("Table charset/collation is not supported for {} from this editor.", dialect_label(dialect)));
        return Vec::new();
    }
    let Some(charset) = clean_mysql_option_name(&new_charset) else {
        warnings.push("Table character set contains unsupported characters.".to_string());
        return Vec::new();
    };
    let collation = if new_collation.is_empty() {
        None
    } else {
        match clean_mysql_option_name(&new_collation) {
            Some(value) => Some(value),
            None => {
                warnings.push("Table collation contains unsupported characters.".to_string());
                return Vec::new();
            }
        }
    };
    let table = qualified_table(dialect, options.schema.as_deref(), &options.table_name);
    let collate_clause = collation.map(|value| format!(" COLLATE {value}")).unwrap_or_default();
    vec![format!("ALTER TABLE {table} CONVERT TO CHARACTER SET {charset}{collate_clause};")]
}

pub(super) fn mysql_create_table_charset_clause(
    options: &TableStructureSqlOptions,
    warnings: &mut Vec<String>,
) -> String {
    let charset = clean(options.table_charset.as_deref().unwrap_or(""));
    let collation = clean(options.table_collation.as_deref().unwrap_or(""));
    if charset.is_empty() && collation.is_empty() {
        return String::new();
    }
    let Some(charset) = clean_mysql_option_name(&charset) else {
        warnings.push("Table character set contains unsupported characters.".to_string());
        return String::new();
    };
    let mut clause = format!(" DEFAULT CHARACTER SET {charset}");
    if !collation.is_empty() {
        let Some(collation) = clean_mysql_option_name(&collation) else {
            warnings.push("Table collation contains unsupported characters.".to_string());
            return String::new();
        };
        clause.push_str(&format!(" COLLATE {collation}"));
    }
    clause
}

fn clean_mysql_option_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_').then(|| trimmed.to_string())
}

pub(super) fn build_table_comment_sql(options: &TableStructureSqlOptions, warnings: &mut Vec<String>) -> Vec<String> {
    let capabilities = capabilities_for(options.database_type);
    if !capabilities.comment {
        return Vec::new();
    }
    let new_comment = options.table_comment.as_deref().unwrap_or("");
    let original_comment = options.original_table_comment.as_deref().unwrap_or("");
    if clean(new_comment) == clean(original_comment) {
        return Vec::new();
    }
    let dialect = capabilities.dialect;
    let table = qualified_table(dialect, options.schema.as_deref(), &options.table_name);
    let quoted = quote_string(&clean(new_comment));
    match dialect {
        StructureDialect::Mysql => {
            vec![format!("ALTER TABLE {table} COMMENT = {quoted};")]
        }
        StructureDialect::Postgres | StructureDialect::Oracle | StructureDialect::Dameng | StructureDialect::H2 => {
            vec![format!("COMMENT ON TABLE {table} IS {quoted};")]
        }
        StructureDialect::ClickHouse => {
            vec![format!("ALTER TABLE {table} MODIFY COMMENT {quoted};")]
        }
        StructureDialect::SqlServer => {
            build_sqlserver_table_comment_sql(&table, options.schema.as_deref(), &options.table_name, new_comment)
        }
        _ => {
            if !clean(new_comment).is_empty() {
                warnings
                    .push(format!("Table comments are not supported for {} from this editor.", dialect_label(dialect)));
            }
            Vec::new()
        }
    }
}

pub(super) fn sqlserver_schema_name(schema: Option<&str>) -> String {
    schema.filter(|s| !s.trim().is_empty()).map(|s| s.trim().to_string()).unwrap_or_else(|| "dbo".to_string())
}

pub(super) fn build_sqlserver_table_comment_sql(
    qualified_table: &str,
    schema: Option<&str>,
    table_name: &str,
    new_comment: &str,
) -> Vec<String> {
    let mut statements = Vec::new();
    let schema_name = sqlserver_schema_name(schema);
    let escaped_qualified = qualified_table.replace('\'', "''");
    let escaped_schema = schema_name.replace('\'', "''");
    let escaped_table = table_name.replace('\'', "''");

    statements.push(format!(
        "IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'{escaped_qualified}') AND minor_id = 0 AND name = N'MS_Description') EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}';"
    ));

    if !clean(new_comment).is_empty() {
        let quoted_comment = clean(new_comment).replace('\'', "''");
        statements.push(format!(
            "EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'{quoted_comment}', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}';"
        ));
    }

    statements
}

pub(super) fn build_sqlserver_index_comment_sql(
    qualified_table: &str,
    schema: Option<&str>,
    table_name: &str,
    index_name: &str,
    new_comment: &str,
) -> Vec<String> {
    let mut statements = Vec::new();
    let schema_name = sqlserver_schema_name(schema);
    let escaped_qualified = qualified_table.replace('\'', "''");
    let escaped_schema = schema_name.replace('\'', "''");
    let escaped_table = table_name.replace('\'', "''");
    let escaped_idx = index_name.replace('\'', "''");

    statements.push(format!(
        "IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'{escaped_qualified}') AND minor_id = 0 AND name = N'MS_Description' AND class_desc = 'INDEX') EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}', @level2type=N'INDEX', @level2name=N'{escaped_idx}';"
    ));

    if !clean(new_comment).is_empty() {
        let quoted_comment = clean(new_comment).replace('\'', "''");
        statements.push(format!(
            "EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'{quoted_comment}', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}', @level2type=N'INDEX', @level2name=N'{escaped_idx}';"
        ));
    }

    statements
}

pub(super) fn build_sqlserver_column_comment_sql(
    qualified_table: &str,
    schema: Option<&str>,
    table_name: &str,
    column_name: &str,
    new_comment: &str,
) -> Vec<String> {
    let mut statements = Vec::new();
    let schema_name = sqlserver_schema_name(schema);
    let escaped_qualified = qualified_table.replace('\'', "''");
    let escaped_schema = schema_name.replace('\'', "''");
    let escaped_table = table_name.replace('\'', "''");
    let escaped_col = column_name.replace('\'', "''");

    statements.push(format!(
        "IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'{escaped_qualified}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'{escaped_qualified}'), N'{escaped_col}', 'ColumnId') AND name = N'MS_Description') EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}', @level2type=N'COLUMN', @level2name=N'{escaped_col}';"
    ));

    if !clean(new_comment).is_empty() {
        let quoted_comment = clean(new_comment).replace('\'', "''");
        statements.push(format!(
            "EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'{quoted_comment}', @level0type=N'SCHEMA', @level0name=N'{escaped_schema}', @level1type=N'TABLE', @level1name=N'{escaped_table}', @level2type=N'COLUMN', @level2name=N'{escaped_col}';"
        ));
    }

    statements
}
