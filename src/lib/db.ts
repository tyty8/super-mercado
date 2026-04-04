import { sql } from "@vercel/postgres";

export { sql };

export async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS supermarkets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(50) NOT NULL UNIQUE,
      logo_url VARCHAR(500),
      website_url VARCHAR(500) NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(300) NOT NULL,
      brand VARCHAR(100) NOT NULL,
      category VARCHAR(100) NOT NULL,
      unit VARCHAR(50) NOT NULL,
      image_url VARCHAR(500)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS prices (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supermarket_id INT NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
      price INT NOT NULL,
      last_updated TIMESTAMP DEFAULT NOW(),
      UNIQUE(product_id, supermarket_id)
    )
  `;
}
