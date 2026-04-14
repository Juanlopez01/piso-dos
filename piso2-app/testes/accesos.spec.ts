import { test, expect } from '@playwright/test';

test.describe('Módulo 1: Accesos y El Patovica', () => {

  test('Un visitante es redirigido al login al intentar ver liquidaciones', async ({ page }) => {
    // 1. El robot intenta entrar a la fuerza
    await page.goto('http://localhost:3000/liquidaciones');

    // 2. Verificamos que el sistema lo haya mandado al login
    // Usamos una expresión regular /.*login/ para que atrape "/login" o "/login?next=/liquidaciones"
    await expect(page).toHaveURL(/.*login/);
  });

  test('Un alumno choca contra el muro de Acceso Denegado en /liquidaciones', async ({ page }) => {
    // 1. El robot va al login
    await page.goto('http://localhost:3000/login');

    // 2. Llena sus datos y entra (¡Cambialos por los tuyos de prueba!)
    // Acá Playwright busca los inputs por su "placeholder" o su "type"
    await page.getByPlaceholder('juanperez@gmail.com').fill('juan@1.com');
    await page.getByPlaceholder('••••••••').fill('12345678');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // 3. Esperamos a que cargue la página principal para confirmar que entró bien
    await expect(page).toHaveURL('http://localhost:3000/explorar');

    // 4. Ahora, logueado como alumno, intenta meterse a la fuerza a liquidaciones
    await page.goto('http://localhost:3000/liquidaciones');

    // 5. ¡Ahora SÍ debería saltar tu cartel de restricción de rol!
    const tituloDenegado = page.getByRole('heading', { name: 'Acceso Denegado' });
    await expect(tituloDenegado).toBeVisible();
  });

  test('Un profesor sin grupo asignado ve "Acceso Restringido" en Compañías', async ({ page }) => {
    // 1. El robot va al login
    await page.goto('http://localhost:3000/login');

    // 2. Llena sus datos con una cuenta de PROFESOR
    await page.getByPlaceholder('juanperez@gmail.com').fill('juan@1.com'); // ¡Cambiá este mail!
    await page.getByPlaceholder('••••••••').fill('12345678');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // 3. Esperamos a que cargue la página principal
    await expect(page).toHaveURL('http://localhost:3000/mis-clases');

    // 4. Va a la sección de compañías
    await page.goto('http://localhost:3000/companias');

    // 5. Verificamos que aparezca el cartel del candado que armamos
    const tituloRestringido = page.getByRole('heading', { name: 'Acceso Restringido' });
    await expect(tituloRestringido).toBeVisible();

    // 6. Verificamos que el botón de redirección diga "Ir a mi Agenda" (específico de profes)
    const botonAgenda = page.getByRole('link', { name: 'Ir a mi Agenda' });
    await expect(botonAgenda).toBeVisible();
  });

  test('Recepción tiene acceso permitido al panel de Liquidaciones', async ({ page }) => {
    // 1. El robot va al login
    await page.goto('http://localhost:3000/login');

    // 2. Llena sus datos con una cuenta de RECEPCIÓN
    await page.getByPlaceholder('juanperez@gmail.com').fill('juanpablolopez43@gmail.com'); // ¡Asegurate de usar un mail válido de recepción!
    await page.getByPlaceholder('••••••••').fill('Juan43343');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // 3. Esperamos a que cargue el inicio
    await expect(page).toHaveURL('http://localhost:3000/admin');

    // 4. Intenta entrar directo a la página restringida
    await page.goto('http://localhost:3000/liquidaciones');

    // 5. Verificamos que NO haya cartel de denegado
    const tituloDenegado = page.getByRole('heading', { name: 'Acceso Denegado' });
    await expect(tituloDenegado).not.toBeVisible();

    // 6. Verificamos que efectivamente esté viendo la data
    const tituloPagina = page.getByRole('heading', { name: 'Liquidaciones Staff' });
    await expect(tituloPagina).toBeVisible();
  });

});

