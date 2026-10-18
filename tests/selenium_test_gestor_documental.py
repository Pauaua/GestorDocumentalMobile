"""
Pruebas funcionales automatizadas del RTLCO - Gestor documental escolar.
Selenium 4 + pytest + Chrome headless contra la versión web servida por Express en EC2
(detrás del ALB) o contra una URL configurable.

Ejecución:
    pip install -r requirements.txt
    pytest selenium_test_gestor_documental.py --base-url https://demo.rtlco.cl
    # o: BASE_URL=http://<dns-del-alb> pytest selenium_test_gestor_documental.py -v

Colegio: con subdominio (demo.rtlco.cl) se toma del host; sin subdominio el login pide el código
y se usa SCHOOL (por defecto "demo", el colegio del seed).

Resultado: resultados_pruebas_funcionales.json (trazabilidad por caso) y, si un caso
falla, una captura en evidencias/<ID>.png.

Los datos de prueba provienen del seed del backend (contraseña común: Rtlco2026).
Los elementos se ubican por data-testid (testID de React Native Web), que son estables.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
import requests
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait

PASSWORD = os.environ.get("SEED_PASSWORD", "Rtlco2026")
SCHOOL = os.environ.get("SCHOOL", "demo")
TIMEOUT = int(os.environ.get("UI_TIMEOUT", "20"))

USUARIOS = {
    "director": ("director@rtlco.cl", "Marcela"),
    "equipo": ("utp@rtlco.cl", "Carolina"),
    "docente": ("docente@rtlco.cl", "Felipe"),
    "apoderado": ("apoderado@rtlco.cl", "Paula"),
    "apoderado2": ("apoderado2@rtlco.cl", "Rodrigo"),
}

# Folios del seed y su audiencia (ver backend/prisma/seed.ts).
FOLIO_OFICIO = "OF-2026-003"  # solo equipo directivo
FOLIO_CITACION = "CIT-2026-021"  # dirigida a la apoderada Paula Díaz
FOLIO_ACUERDO = "ACU-2026-002"  # docentes y apoderados
FOLIO_ACTA = "ACT-2026-005"  # docentes
FOLIO_MEMO = "MEM-2026-014"  # docentes
FOLIO_PERMISO = "PA-2026-011"  # dirigido al docente Felipe Soto


# =============================================================================
# Utilidades de interacción
# =============================================================================
def _css(testid: str) -> str:
    return f'[data-testid="{testid}"]'


def visibles(driver: WebDriver, selector: str) -> list[WebElement]:
    """Elementos visibles. Las tabs mantienen montadas pantallas ocultas: se filtran."""
    out = []
    for el in driver.find_elements(By.CSS_SELECTOR, selector):
        try:
            if el.is_displayed():
                out.append(el)
        except StaleElementReferenceException:
            continue
    return out


def esperar(driver: WebDriver, testid: str, timeout: int = TIMEOUT) -> WebElement:
    """Espera a que un elemento con ese data-testid sea visible y lo devuelve."""
    return WebDriverWait(driver, timeout).until(
        lambda d: (visibles(d, _css(testid)) or [False])[0],
        message=f"No apareció el elemento visible data-testid='{testid}'",
    )


def clic(driver: WebDriver, testid: str) -> None:
    el = esperar(driver, testid)
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
    el.click()


def escribir(driver: WebDriver, testid: str, texto: str) -> None:
    el = esperar(driver, testid)
    el.clear()
    el.send_keys(texto)


def fijar_fecha(driver: WebDriver, testid: str, iso: str) -> None:
    """Asigna un <input type="date"> de forma compatible con React (setter nativo + evento)."""
    el = esperar(driver, testid)
    driver.execute_script(
        """
        const [input, value] = arguments;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        """,
        el,
        iso,
    )


def folios_visibles(driver: WebDriver) -> list[str]:
    """Folios de las tarjetas visibles en la lista de documentos."""
    folios = []
    for card in visibles(driver, '[data-testid^="document-card-"]'):
        for linea in card.text.splitlines():
            if linea.startswith("Folio "):
                folios.append(linea.removeprefix("Folio ").strip())
    return sorted(folios)


def esperar_lista_estable(driver: WebDriver, timeout: int = TIMEOUT) -> list[str]:
    """Espera a que la lista termine de cargar y deje de cambiar (debounce de búsqueda)."""
    fin = time.time() + timeout
    previo: list[str] | None = None
    while time.time() < fin:
        contador = visibles(driver, _css("documents-count"))
        if contador and "Cargando" not in contador[0].text:
            actual = folios_visibles(driver)
            if actual == previo:
                return actual
            previo = actual
        time.sleep(0.6)
    raise AssertionError("La lista de documentos no se estabilizó a tiempo")


def abrir_login(driver: WebDriver, base_url: str) -> None:
    """Abre el login; si la URL no trae el colegio (sin subdominio), escribe el código SCHOOL."""
    driver.get(f"{base_url}/")
    WebDriverWait(driver, TIMEOUT).until(
        lambda d: visibles(d, _css("login-email")) or visibles(d, _css("login-school")),
        message="No apareció el formulario de inicio de sesión",
    )
    if visibles(driver, _css("login-school")):
        escribir(driver, "login-school", SCHOOL)
        clic(driver, "login-school-submit")
    esperar(driver, "login-email")


def iniciar_sesion(driver: WebDriver, base_url: str, rol: str) -> None:
    email, nombre = USUARIOS[rol]
    abrir_login(driver, base_url)
    escribir(driver, "login-email", email)
    escribir(driver, "login-password", PASSWORD)
    clic(driver, "login-submit")
    saludo = esperar(driver, "home-greeting")
    assert nombre in saludo.text, f"Saludo inesperado: {saludo.text}"


def cerrar_sesion(driver: WebDriver) -> None:
    clic(driver, "nav-profile")
    clic(driver, "profile-logout")
    esperar(driver, "login-email")


def ir_a_documentos(driver: WebDriver) -> list[str]:
    clic(driver, "nav-documents")
    return esperar_lista_estable(driver)


def nav_items(driver: WebDriver) -> list[str]:
    """Pestañas visibles (sin los contadores de avisos, que también usan el prefijo nav-)."""
    ids = (el.get_attribute("data-testid") for el in visibles(driver, '[data-testid^="nav-"]'))
    return sorted(i for i in ids if not i.endswith("-badge"))


# =============================================================================
# Cliente de la API (para preparar datos y verificar persistencia/permisos)
# =============================================================================
class Api:
    def __init__(self, base_url: str, rol: str):
        self.base = f"{base_url}/api/v1"
        email, _ = USUARIOS[rol]
        # Con subdominio el servidor usa el host; X-School cubre la URL del ALB sin subdominio.
        school = {"X-School": SCHOOL}
        res = requests.post(f"{self.base}/auth/login", json={"email": email, "password": PASSWORD}, headers=school, timeout=30)
        res.raise_for_status()
        self.headers = {**school, "Authorization": f"Bearer {res.json()['accessToken']}"}

    def get(self, path: str, **params) -> requests.Response:
        return requests.get(f"{self.base}{path}", headers=self.headers, params=params, timeout=30)

    def documento_por_folio(self, folio: str) -> dict:
        items = self.get("/documents", q=folio, pageSize=5).json()["items"]
        coincidencias = [d for d in items if d["folioNumber"] == folio]
        assert coincidencias, f"No existe el documento con folio {folio} (¿se ejecutó el seed?)"
        return coincidencias[0]


@pytest.fixture
def pdf_de_prueba(tmp_path: Path) -> Path:
    archivo = tmp_path / "citacion-reunion-apoderado.pdf"
    archivo.write_bytes(
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF\n"
    )
    return archivo


# =============================================================================
# Casos de prueba
# =============================================================================
@pytest.mark.caso(
    id="CP-01",
    requisito="RF-01 Autenticación: inicio de sesión con credenciales válidas (JWT)",
    rol="director",
    pasos=[
        "Abrir la URL pública",
        "Ingresar correo director@rtlco.cl y la contraseña",
        "Presionar 'Ingresar'",
    ],
    esperado="Se muestra el inicio con el saludo 'Marcela' y el rol 'Director(a)'",
)
def test_login_correcto(driver, base_url, caso):
    iniciar_sesion(driver, base_url, "director")
    rol = esperar(driver, "home-role").text
    assert rol == "Director(a)"
    caso.resultado_obtenido = f"Inicio mostrado: '{esperar(driver, 'home-greeting').text}' · rol '{rol}'"


@pytest.mark.caso(
    id="CP-02",
    requisito="RF-01 Autenticación: rechazo de credenciales inválidas",
    rol="director",
    pasos=["Abrir la URL pública", "Ingresar el correo del director con una contraseña incorrecta", "Presionar 'Ingresar'"],
    esperado="Se muestra 'Correo o contraseña incorrectos' y no se accede a la aplicación",
)
def test_login_incorrecto(driver, base_url, caso):
    abrir_login(driver, base_url)
    escribir(driver, "login-email", USUARIOS["director"][0])
    escribir(driver, "login-password", "ClaveIncorrecta123")
    clic(driver, "login-submit")
    error = esperar(driver, "login-error").text
    assert "incorrectos" in error
    assert not visibles(driver, _css("home-greeting")), "No debería entrar a la aplicación"
    caso.resultado_obtenido = f"Mensaje mostrado: '{error}'. Permanece en el login."


@pytest.mark.caso(
    id="CP-03",
    requisito="RF-02 Cargar, clasificar y almacenar documentos (S3 + metadatos en RDS)",
    rol="director",
    pasos=[
        "Iniciar sesión como director",
        "Ir a 'Subir' y adjuntar un PDF",
        "Completar título, tipo 'Citación', folio y descripción",
        "Elegir como destinatario al apoderado Rodrigo Pérez",
        "Presionar 'Subir documento'",
    ],
    esperado="Se abre el detalle con los metadatos y el tipo 'Citación'; el documento queda registrado en la API",
)
def test_director_sube_y_clasifica_documento(driver, base_url, caso, pdf_de_prueba):
    titulo = f"Citación Selenium {int(time.time())}"
    folio = f"CIT-SEL-{int(time.time()) % 100000}"
    iniciar_sesion(driver, base_url, "director")
    clic(driver, "nav-upload")
    esperar(driver, "document-form-title")
    driver.find_element(By.CSS_SELECTOR, _css("upload-file-input")).send_keys(str(pdf_de_prueba))
    assert esperar(driver, "upload-file-name").text == pdf_de_prueba.name
    escribir(driver, "document-form-title", titulo)
    clic(driver, "document-form-type-CITACION")
    escribir(driver, "document-form-folio", folio)
    escribir(driver, "document-form-description", "Reunión con profesor jefe. Generado por la prueba automatizada.")
    escribir(driver, "recipient-search", "Rodrigo")
    clic(driver, "recipient-option-apoderado2@rtlco.cl")
    clic(driver, "document-form-submit")

    assert esperar(driver, "document-title", timeout=40).text == titulo
    assert esperar(driver, "document-type").text == "Citación"
    assert esperar(driver, "document-folio").text == folio
    esperar(driver, "toast-success")

    # Persistencia: metadatos en PostgreSQL (vía API) con autor, tipo y destinatario.
    doc = Api(base_url, "director").documento_por_folio(folio)
    assert doc["documentType"]["code"] == "CITACION"
    assert doc["author"]["fullName"] == "Marcela Rojas Fuentes"
    assert [r["fullName"] for r in doc["recipients"]] == ["Rodrigo Pérez Castro"]
    assert doc["mimeType"] == "application/pdf"
    caso.resultado_obtenido = (
        f"Documento '{titulo}' creado (id {doc['id']}), tipo {doc['documentType']['name']}, "
        f"folio {folio}, {doc['fileSize']} bytes en S3, destinatario Rodrigo Pérez Castro"
    )


@pytest.mark.caso(
    id="CP-04",
    requisito="RF-03 Consultar documentos: búsqueda por texto",
    rol="director",
    pasos=["Iniciar sesión como director", "Ir a 'Documentos'", "Escribir 'celulares' en el buscador"],
    esperado=f"Solo aparece el acuerdo {FOLIO_ACUERDO} sobre uso de celulares",
)
def test_busqueda_por_texto(driver, base_url, caso):
    iniciar_sesion(driver, base_url, "director")
    todos = ir_a_documentos(driver)
    escribir(driver, "documents-search", "celulares")
    WebDriverWait(driver, TIMEOUT).until(lambda d: folios_visibles(d) != todos)
    resultado = esperar_lista_estable(driver)
    assert resultado == [FOLIO_ACUERDO]
    caso.resultado_obtenido = f"De {len(todos)} documentos, la búsqueda devolvió {resultado}"


@pytest.mark.caso(
    id="CP-05",
    requisito="RF-03 Consultar documentos: filtros por tipo y rango de fechas",
    rol="equipo_directivo",
    pasos=[
        "Iniciar sesión como equipo directivo",
        "Ir a 'Documentos' y elegir el filtro de tipo 'Acta'",
        "Quitar el tipo, abrir 'Más filtros' y fijar el rango 01-03-2026 a 31-03-2026",
    ],
    esperado="Con 'Acta' solo se ven actas; con el rango de marzo solo documentos fechados en marzo de 2026",
)
def test_filtros_por_tipo_y_fecha(driver, base_url, caso):
    iniciar_sesion(driver, base_url, "equipo")
    ir_a_documentos(driver)
    clic(driver, "filter-type-ACTA")
    time.sleep(0.8)
    actas = esperar_lista_estable(driver)
    etiquetas = {t.text for card in visibles(driver, '[data-testid^="document-card-"]')
                 for t in card.find_elements(By.CSS_SELECTOR, '[data-testid^="tag-"]')}
    assert FOLIO_ACTA in actas and etiquetas == {"Acta"}, f"Filtro por tipo incorrecto: {actas} {etiquetas}"

    clic(driver, "filter-type-all")
    clic(driver, "filters-toggle")
    fijar_fecha(driver, "filter-date-from", "2026-03-01")
    fijar_fecha(driver, "filter-date-to", "2026-03-31")
    time.sleep(0.8)
    marzo = esperar_lista_estable(driver)
    assert marzo == sorted([FOLIO_ACTA, FOLIO_ACUERDO, FOLIO_MEMO]), f"Filtro por fecha incorrecto: {marzo}"
    caso.resultado_obtenido = f"Tipo Acta → {actas}; rango marzo 2026 → {marzo}"


@pytest.mark.caso(
    id="CP-06",
    requisito="RF-04 Descarga autorizada con presigned URL (5 min) y registro de descargas",
    rol="apoderado",
    pasos=[
        "Iniciar sesión como la apoderada Paula Díaz",
        f"Abrir la citación {FOLIO_CITACION} dirigida a ella",
        "Presionar 'Descargar'",
    ],
    esperado="El archivo se descarga y la descarga queda en el registro visible para el equipo directivo",
)
def test_descarga_autorizada(driver, base_url, caso, download_dir):
    director = Api(base_url, "director")
    citacion = director.documento_por_folio(FOLIO_CITACION)
    descargas_antes = len(director.get(f"/documents/{citacion['id']}/downloads").json())

    iniciar_sesion(driver, base_url, "apoderado")
    folios = ir_a_documentos(driver)
    assert FOLIO_CITACION in folios
    clic(driver, f"document-card-{citacion['id']}")
    assert esperar(driver, "document-title").text == citacion["title"]
    clic(driver, "document-download")
    esperar(driver, "toast-success")

    fin = time.time() + TIMEOUT
    archivos: list[Path] = []
    while time.time() < fin and not archivos:
        archivos = [p for p in download_dir.iterdir() if not p.name.endswith(".crdownload")]
        time.sleep(0.5)
    assert archivos, "El navegador no descargó el archivo"
    assert archivos[0].read_bytes().startswith(b"%PDF"), "El archivo descargado no es un PDF"

    registros = director.get(f"/documents/{citacion['id']}/downloads").json()
    assert len(registros) == descargas_antes + 1
    assert registros[0]["user"]["fullName"] == "Paula Díaz Morales"
    caso.resultado_obtenido = (
        f"Descargado '{archivos[0].name}' ({archivos[0].stat().st_size} bytes). "
        f"Registro de descargas: {descargas_antes} → {len(registros)} (último: {registros[0]['user']['fullName']})"
    )


@pytest.mark.caso(
    id="CP-07",
    requisito="RF-05 Permisos: un apoderado NO ve ni descarga documentos no autorizados",
    rol="apoderado",
    pasos=[
        "Iniciar sesión como la apoderada Paula Díaz y abrir 'Documentos'",
        f"Intentar abrir por URL directa el oficio {FOLIO_OFICIO} (solo equipo directivo)",
        "Pedir a la API la URL de descarga del oficio con el token del apoderado",
    ],
    esperado="La lista solo muestra lo autorizado; la URL directa muestra 'No tienes acceso' y la API responde 403",
)
def test_apoderado_no_ve_documentos_no_autorizados(driver, base_url, caso):
    oficio = Api(base_url, "director").documento_por_folio(FOLIO_OFICIO)

    iniciar_sesion(driver, base_url, "apoderado")
    assert nav_items(driver) == ["nav-documents", "nav-home", "nav-notifications", "nav-profile"]
    folios = ir_a_documentos(driver)
    prohibidos = {FOLIO_OFICIO, FOLIO_ACTA, FOLIO_MEMO, FOLIO_PERMISO}
    assert {FOLIO_CITACION, FOLIO_ACUERDO} <= set(folios)
    assert not prohibidos & set(folios), f"El apoderado ve documentos no autorizados: {prohibidos & set(folios)}"

    driver.get(f"{base_url}/documents/{oficio['id']}")
    esperar(driver, "document-forbidden")

    apoderado = Api(base_url, "apoderado")
    detalle = apoderado.get(f"/documents/{oficio['id']}")
    descarga = apoderado.get(f"/documents/{oficio['id']}/download-url")
    assert detalle.status_code == 403 and descarga.status_code == 403
    caso.resultado_obtenido = (
        f"Lista del apoderado: {folios}. URL directa al oficio → 'No tienes acceso'. "
        f"API: detalle {detalle.status_code}, download-url {descarga.status_code}"
    )


@pytest.mark.caso(
    id="CP-08",
    requisito="RF-05 Permisos: un docente solo ve lo visible para su rol y lo dirigido a él",
    rol="docente",
    pasos=["Iniciar sesión como el docente Felipe Soto", "Abrir 'Documentos'", "Revisar menú y listado"],
    esperado=(
        "Ve memo, acta, acuerdo y su permiso administrativo; no ve el oficio ni la citación; "
        "no tiene opciones de subir ni de usuarios"
    ),
)
def test_docente_solo_ve_lo_que_corresponde(driver, base_url, caso):
    iniciar_sesion(driver, base_url, "docente")
    assert nav_items(driver) == ["nav-documents", "nav-home", "nav-notifications", "nav-profile"]
    folios = ir_a_documentos(driver)
    esperados = {FOLIO_MEMO, FOLIO_ACTA, FOLIO_ACUERDO, FOLIO_PERMISO}
    assert esperados <= set(folios), f"Faltan documentos del docente: {esperados - set(folios)}"
    assert FOLIO_OFICIO not in folios and FOLIO_CITACION not in folios
    assert not any(f.startswith("CIT-SEL-") for f in folios), "Ve citaciones dirigidas a apoderados"
    assert not visibles(driver, _css("documents-upload")), "Un docente no debe ver el botón de subir"
    caso.resultado_obtenido = f"Menú: {nav_items(driver)}. Documentos visibles: {folios}"


@pytest.mark.caso(
    id="CP-09",
    requisito="RF-01 Autenticación: cierre de sesión y revocación del refresh token",
    rol="equipo_directivo",
    pasos=["Iniciar sesión como equipo directivo", "Ir a 'Perfil' y presionar 'Cerrar sesión'", "Recargar /documents"],
    esperado="Vuelve al login y, al recargar una ruta protegida, sigue en el login (sesión revocada)",
)
def test_logout(driver, base_url, caso):
    iniciar_sesion(driver, base_url, "equipo")
    cerrar_sesion(driver)
    driver.get(f"{base_url}/documents")
    esperar(driver, "login-email")
    assert not visibles(driver, _css("documents-list"))
    caso.resultado_obtenido = "Tras cerrar sesión se muestra el login; /documents redirige al login"


@pytest.mark.caso(
    id="CP-10",
    requisito="RF-07 Acuse de recibo: la apoderada confirma la recepción y la dirección lo ve en el informe",
    rol="apoderado",
    pasos=[
        f"Iniciar sesión como la apoderada Paula Díaz y abrir la citación {FOLIO_CITACION} (requiere confirmación)",
        "Presionar 'Confirmar recepción'",
        "Iniciar sesión como directora y abrir la misma citación",
    ],
    esperado="La apoderada ve 'Confirmaste la recepción'; la directora ve en 'Acuses de recibo' que 1 de 1 confirmó",
)
def test_acuse_de_recibo(driver, base_url, caso):
    citacion = Api(base_url, "director").documento_por_folio(FOLIO_CITACION)
    iniciar_sesion(driver, base_url, "apoderado")
    driver.get(f"{base_url}/documents/{citacion['id']}")
    esperar(driver, "document-ack-pending")
    clic(driver, "document-ack-submit")
    confirmado = esperar(driver, "document-ack-done").text
    assert "Confirmaste la recepción" in confirmado

    cerrar_sesion(driver)
    iniciar_sesion(driver, base_url, "director")
    driver.get(f"{base_url}/documents/{citacion['id']}")
    resumen = esperar(driver, "document-receipts-summary").text
    assert "1 de 1 lo abrieron" in resumen and "1 confirmaron" in resumen
    caso.resultado_obtenido = f"Apoderada: '{confirmado}'. Informe de la directora: '{resumen}'"
