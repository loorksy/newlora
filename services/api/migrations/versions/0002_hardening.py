"""Durable tool operations, encrypted run checkpoints, retrieval and attachment links."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "runs", sa.Column("purpose", sa.String(20), nullable=False, server_default="chat")
    )
    op.add_column("usage", sa.Column("pricing_snapshot", sa.JSON(), nullable=True))
    op.add_column("runs", sa.Column("checkpoint", sa.Text(), nullable=True))
    op.add_column(
        "messages", sa.Column("attachments", sa.JSON(), nullable=False, server_default="[]")
    )
    op.create_table(
        "operations",
        sa.Column("id", sa.String(180), primary_key=True),
        sa.Column(
            "run_id", sa.String(36), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("tool", sa.String(50), nullable=False),
        sa.Column("arguments", sa.Text(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_operations_run_id", "operations", ["run_id"])
    op.create_table(
        "search_documents",
        sa.Column("id", sa.String(180), primary_key=True),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("session_id", sa.String(160), nullable=True),
        sa.Column("resource_id", sa.String(160), nullable=False),
        sa.Column("resource_type", sa.String(40), nullable=False),
        sa.Column("instrument", sa.String(24), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ("owner", "session_id", "resource_type", "instrument", "created_at"):
        op.create_index("ix_search_documents_" + column, "search_documents", [column])
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX ix_search_documents_fts ON search_documents USING gin (to_tsvector('simple', summary))"
        )


def downgrade():
    op.drop_column("runs", "purpose")
    op.drop_column("usage", "pricing_snapshot")
    op.drop_table("search_documents")
    op.drop_table("operations")
    op.drop_column("messages", "attachments")
    op.drop_column("runs", "checkpoint")
