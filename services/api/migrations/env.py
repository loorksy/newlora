import asyncio

from alembic import context
from newlora.db import Base, engine


def migrate(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run():
    async with engine().connect() as connection:
        await connection.run_sync(migrate)


asyncio.run(run())
