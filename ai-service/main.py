from fastapi import FastAPI

app = FastAPI(title="SIH-AGRI AI Service")


@app.get("/")
def root():
    return {"message": "SIH-AGRI AI service is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
