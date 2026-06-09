import psycopg2

def get_connection():
    return psycopg2.connect(
        host="localhost",
        database="isecxplorer",
        user="postgres",
        password="postgres"
    )
