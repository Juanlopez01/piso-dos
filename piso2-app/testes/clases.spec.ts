import { test, expect } from '@playwright/test';

test.describe('Módulo 2: Clases y Agenda', () => {

    test('Admin puede crear una clase nueva en la agenda', async ({ page }) => {
        // 1. Logueo como Admin
        await page.goto('http://localhost:3000/login');
        await page.getByPlaceholder('juanperez@gmail.com').fill('juanpablolopez43@gmail.com'); // Cambiar por tu admin
        await page.getByPlaceholder('••••••••').fill('Juan43343');
        await page.getByRole('button', { name: 'Ingresar' }).click();
        await expect(page).toHaveURL('http://localhost:3000/admin');

        // 2. Navegar a la Agenda
        await page.getByRole('link', { name: 'Agenda' }).click();
        await expect(page).toHaveURL(/.*calendario/);

        // 3. Abrir modal de nueva clase
        await page.getByRole('button', { name: 'Crear Clase' }).click(); // Ajustá este nombre si tu botón dice distinto

        // 4. Llenar el formulario básico
        // Nota: Ajustá los nombres de los campos según tu interfaz (label o placeholder)
        await page.getByLabel('Nombre de la Clase').fill('Clase de Prueba Automatizada');

        // Seleccionar profe (Suponiendo que tenés un select)
        await page.locator('select[name="profesor_id"]').selectOption({ index: 1 });

        // Llenar cupo y precio
        await page.getByLabel('Cupo Máximo').fill('20');
        await page.getByLabel('Precio').fill('5000');

        // 5. Guardar la clase
        await page.getByRole('button', { name: 'Guardar' }).click();

        // 6. Verificar que aparezca el cartel de éxito de Sonner
        const toastExito = page.locator('text=Clase creada con éxito');
        await expect(toastExito).toBeVisible();
    });

});