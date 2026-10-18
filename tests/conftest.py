"""
Infraestructura de pytest para las pruebas funcionales de RTLCO:
- opciones de línea de comandos (--base-url, --headed, --results)
- fixture del navegador (Chrome headless, Selenium 4)
- registro de trazabilidad en resultados_pruebas_funcionales.json
- captura de pantalla como evidencia cuando un caso falla
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pytest
from selenium import webdriver

TESTS_DIR = Path(__file__).resolve().parent
DEFAULT_RESULTS = TESTS_DIR / "resultados_pruebas_funcionales.json"
EVIDENCE_DIR = TESTS_DIR / "evidencias"


def pytest_addoption(parser: pytest.Parser) -> None:
    group = parser.getgroup("gestor-documental")
    group.addoption(
        "--base-url",
        default=os.environ.get("BASE_URL", "http://localhost:3000"),
        help="URL pública de la app (ALB/Route 53) o local. También BASE_URL.",
    )
    group.addoption("--headed", action="store_true", help="Muestra el navegador (por defecto headless).")
    group.addoption("--results", default=str(DEFAULT_RESULTS), help="Ruta del JSON de resultados.")


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "caso(id, requisito, rol, pasos, esperado): metadatos de trazabilidad del caso de prueba",
    )
    config._resultados = []  # type: ignore[attr-defined]
    config._inicio = time.time()  # type: ignore[attr-defined]


@dataclass
class CasoPrueba:
    id: str
    requisito: str
    rol: str
    pasos: list[str]
    resultado_esperado: str
    resultado_obtenido: str = ""
    estado: str = "NO EJECUTADO"
    duracion_s: float = 0.0
    timestamp: str = ""
    evidencia: str | None = None
    detalle_error: str | None = None
    prueba: str = ""
    observaciones: list[str] = field(default_factory=list)


@pytest.fixture
def caso(request: pytest.FixtureRequest) -> CasoPrueba:
    """Metadatos del caso (marcador @pytest.mark.caso). El test completa resultado_obtenido."""
    marker = request.node.get_closest_marker("caso")
    if marker is None:
        raise RuntimeError(f"{request.node.name} no tiene @pytest.mark.caso")
    meta = marker.kwargs
    registro = CasoPrueba(
        id=meta["id"],
        requisito=meta["requisito"],
        rol=meta["rol"],
        pasos=list(meta["pasos"]),
        resultado_esperado=meta["esperado"],
        prueba=request.node.nodeid,
    )
    request.node._caso = registro
    return registro


@pytest.fixture(scope="session")
def base_url(pytestconfig: pytest.Config) -> str:
    return str(pytestconfig.getoption("--base-url")).rstrip("/")


@pytest.fixture
def download_dir():
    path = Path(tempfile.mkdtemp(prefix="gd-descargas-"))
    yield path
    shutil.rmtree(path, ignore_errors=True)


@pytest.fixture
def driver(request: pytest.FixtureRequest, pytestconfig: pytest.Config, download_dir: Path):
    options = webdriver.ChromeOptions()
    if not pytestconfig.getoption("--headed"):
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1366,900")
    options.add_argument("--lang=es-CL")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_experimental_option(
        "prefs",
        {
            "download.default_directory": str(download_dir),
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True,
            "intl.accept_languages": "es-CL,es",
        },
    )
    drv = webdriver.Chrome(options=options)
    drv.set_page_load_timeout(60)
    request.node._driver = drv
    yield drv
    drv.quit()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo):
    outcome = yield
    report = outcome.get_result()
    registro: CasoPrueba | None = getattr(item, "_caso", None)
    if registro is None:
        return
    if report.when == "setup" and report.failed:
        registro.estado = "ERROR"
        registro.detalle_error = _short_error(report)
    if report.when != "call":
        return

    registro.duracion_s = round(report.duration, 2)
    registro.timestamp = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    if report.passed:
        registro.estado = "APROBADO"
    else:
        registro.estado = "FALLIDO"
        registro.detalle_error = _short_error(report)
        if not registro.resultado_obtenido:
            registro.resultado_obtenido = registro.detalle_error or "El caso falló"
        drv = getattr(item, "_driver", None)
        if drv is not None:
            EVIDENCE_DIR.mkdir(exist_ok=True)
            shot = EVIDENCE_DIR / f"{registro.id}.png"
            try:
                drv.save_screenshot(str(shot))
                registro.evidencia = str(shot.relative_to(TESTS_DIR))
            except Exception:  # noqa: BLE001 - la evidencia es opcional
                pass


def _short_error(report: pytest.TestReport) -> str:
    text = str(report.longrepr) if report.longrepr else ""
    lines = [line for line in text.splitlines() if line.startswith("E ")]
    return " ".join(line[1:].strip() for line in lines[:4]) or text[-400:]


def pytest_runtest_teardown(item: pytest.Item) -> None:
    registro: CasoPrueba | None = getattr(item, "_caso", None)
    if registro is not None:
        item.config._resultados.append(registro)  # type: ignore[attr-defined]


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    config = session.config
    resultados: list[CasoPrueba] = getattr(config, "_resultados", [])
    if not resultados:
        return
    resultados.sort(key=lambda r: r.id)
    resumen = {
        "total": len(resultados),
        "aprobados": sum(r.estado == "APROBADO" for r in resultados),
        "fallidos": sum(r.estado == "FALLIDO" for r in resultados),
        "errores": sum(r.estado == "ERROR" for r in resultados),
    }
    documento = {
        "proyecto": "RTLCO - Gestor documental escolar",
        "suite": "Pruebas funcionales automatizadas (Selenium 4 + pytest)",
        "ejecucion": {
            "fecha": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            "base_url": config.getoption("--base-url"),
            "navegador": "Chrome headless" if not config.getoption("--headed") else "Chrome",
            "sistema": f"{platform.system()} {platform.release()}",
            "python": platform.python_version(),
            "duracion_total_s": round(time.time() - config._inicio, 1),  # type: ignore[attr-defined]
        },
        "resumen": resumen,
        "casos": [asdict(r) for r in resultados],
    }
    out = Path(config.getoption("--results"))
    out.write_text(json.dumps(documento, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
