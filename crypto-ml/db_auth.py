import logging
import os
import sqlite3
from pathlib import Path

import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
LOCAL_DATABASE_PATH = Path(
    os.getenv("LOCAL_AUTH_DB_PATH", Path(__file__).with_name("auth.db"))
)
connection_pool = None
using_sqlite = False


def _initialize_database_backend():
    """Use PostgreSQL when available and a local SQLite database for development otherwise."""
    global connection_pool, using_sqlite

    if DATABASE_URL:
        try:
            connection_pool = pool.SimpleConnectionPool(1, 20, DATABASE_URL)
            logger.info("PostgreSQL authentication database connected")
            return
        except Exception as error:
            logger.warning(
                "PostgreSQL is unavailable; using local SQLite authentication database instead: %s",
                error,
            )

    using_sqlite = True
    logger.info("Using local SQLite authentication database: %s", LOCAL_DATABASE_PATH)


_initialize_database_backend()


def get_db_connection():
    """Get a database connection for the active backend."""
    if using_sqlite:
        connection = sqlite3.connect(LOCAL_DATABASE_PATH)
        connection.row_factory = sqlite3.Row
        return connection
    if connection_pool is None:
        raise RuntimeError("Authentication database is not initialized")
    return connection_pool.getconn()


def return_db_connection(connection):
    """Return a PostgreSQL connection or close a SQLite connection."""
    if connection is None:
        return
    if using_sqlite:
        connection.close()
    elif connection_pool:
        connection_pool.putconn(connection)


def init_db():
    """Create the authentication tables and indexes if they do not yet exist."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        if using_sqlite:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_key TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        else:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    public_key VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_public_key ON users(public_key)")
        connection.commit()
        logger.info("Authentication database initialized successfully")
        return True
    except Exception as error:
        logger.error("Error initializing authentication database: %s", error)
        return False
    finally:
        return_db_connection(connection)


def user_exists(email: str) -> bool:
    connection = None
    try:
        connection = get_db_connection()
        placeholder = "?" if using_sqlite else "%s"
        result = connection.cursor().execute(
            f"SELECT id FROM users WHERE email = {placeholder}", (email,)
        ).fetchone()
        return result is not None
    except Exception as error:
        logger.error("Error checking whether user exists: %s", error)
        return False
    finally:
        return_db_connection(connection)


def create_user(public_key: str, email: str, password_hash: str) -> dict | None:
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        if using_sqlite:
            cursor.execute(
                "INSERT INTO users (public_key, email, password_hash) VALUES (?, ?, ?)",
                (public_key, email, password_hash),
            )
            user_id = cursor.lastrowid
            result = cursor.execute(
                "SELECT id, public_key, email, created_at FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        else:
            cursor.execute(
                "INSERT INTO users (public_key, email, password_hash) VALUES (%s, %s, %s) "
                "RETURNING id, public_key, email, created_at",
                (public_key, email, password_hash),
            )
            result = cursor.fetchone()

        connection.commit()
        if result is None:
            return None
        return {
            "id": result[0],
            "public_key": result[1],
            "email": result[2],
            "created_at": result[3],
        }
    except (psycopg2.IntegrityError, sqlite3.IntegrityError):
        return None
    except Exception as error:
        logger.error("Error creating user: %s", error)
        return None
    finally:
        return_db_connection(connection)


def get_user_by_email(email: str) -> dict | None:
    connection = None
    try:
        connection = get_db_connection()
        placeholder = "?" if using_sqlite else "%s"
        result = connection.cursor().execute(
            "SELECT id, public_key, email, password_hash, created_at FROM users "
            f"WHERE email = {placeholder}",
            (email,),
        ).fetchone()
        if result is None:
            return None
        return {
            "id": result[0],
            "public_key": result[1],
            "email": result[2],
            "password_hash": result[3],
            "created_at": result[4],
        }
    except Exception as error:
        logger.error("Error getting user by email: %s", error)
        return None
    finally:
        return_db_connection(connection)


def get_user_by_id(user_id: int) -> dict | None:
    connection = None
    try:
        connection = get_db_connection()
        placeholder = "?" if using_sqlite else "%s"
        result = connection.cursor().execute(
            "SELECT id, public_key, email, created_at FROM users "
            f"WHERE id = {placeholder}",
            (user_id,),
        ).fetchone()
        if result is None:
            return None
        return {
            "id": result[0],
            "public_key": result[1],
            "email": result[2],
            "created_at": result[3],
        }
    except Exception as error:
        logger.error("Error getting user by id: %s", error)
        return None
    finally:
        return_db_connection(connection)


def close_db_pool():
    if connection_pool:
        connection_pool.closeall()
        logger.info("PostgreSQL authentication connection pool closed")
