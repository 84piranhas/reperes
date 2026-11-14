#!/usr/bin/env python3
"""Vérifie la cohérence du contenu de themes/ avant de publier.

Usage : python3 outils/verifier.py
Sort en erreur (code 1) si un fichier manque ou si une question est mal formée.
"""

import json
import sys
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent / "themes"
TYPES = {"single", "multi", "vf"}
VIDES = {"br", "hr", "img", "input", "meta", "link", "path", "rect", "circle", "line", "polygon", "polyline", "ellipse", "use"}
erreurs = []


def erreur(message):
    erreurs.append(message)


class Balises(HTMLParser):
    """Repère les balises mal fermées dans un fragment de cours."""

    def __init__(self, nom):
        super().__init__()
        self.nom = nom
        self.pile = []

    def handle_starttag(self, tag, attrs):
        if tag not in VIDES:
            self.pile.append(tag)

    def handle_endtag(self, tag):
        if tag in VIDES:
            return
        if not self.pile or self.pile[-1] != tag:
            erreur(f"{self.nom} : </{tag}> inattendu (ouvert : {self.pile[-1] if self.pile else 'rien'})")
        else:
            self.pile.pop()


def lire_json(chemin):
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except FileNotFoundError:
        erreur(f"{chemin.relative_to(RACINE)} : fichier manquant")
    except json.JSONDecodeError as e:
        erreur(f"{chemin.relative_to(RACINE)} : JSON invalide ({e})")
    return None


def verifier_question(q, ou, vus):
    ident = q.get("id", "?")
    ici = f"{ou} [{ident}]"
    if ident in vus:
        erreur(f"{ici} : identifiant en double")
    vus.add(ident)
    for champ in ("id", "type", "q", "bonnes", "explication"):
        if not q.get(champ) and q.get(champ) != [0]:
            erreur(f"{ici} : champ « {champ} » manquant ou vide")
    genre = q.get("type")
    if genre not in TYPES:
        erreur(f"{ici} : type inconnu « {genre} »")
        return
    choix = ["Vrai", "Faux"] if genre == "vf" else q.get("choix", [])
    if genre != "vf" and not 3 <= len(choix) <= 6:
        erreur(f"{ici} : {len(choix)} choix (attendu : 3 à 6)")
    if genre == "vf" and "choix" in q:
        erreur(f"{ici} : une question vrai/faux n'a pas de champ « choix »")
    if len(set(choix)) != len(choix):
        erreur(f"{ici} : deux choix identiques")
    bonnes = q.get("bonnes", [])
    if not bonnes or any(not isinstance(b, int) or not 0 <= b < len(choix) for b in bonnes):
        erreur(f"{ici} : « bonnes » doit lister des rangs valides de choix")
    if len(set(bonnes)) != len(bonnes):
        erreur(f"{ici} : rang répété dans « bonnes »")
    if genre in ("single", "vf") and len(bonnes) != 1:
        erreur(f"{ici} : une seule bonne réponse attendue")
    if genre == "multi" and not 2 <= len(bonnes) < len(choix):
        erreur(f"{ici} : une question à choix multiples a au moins deux bonnes réponses, et pas toutes")


def verifier_theme(ident):
    dossier = RACINE / ident
    theme = lire_json(dossier / "theme.json")
    if theme is None:
        return
    if theme.get("id") != ident:
        erreur(f"{ident}/theme.json : « id » doit valoir « {ident} »")
    for champ in ("domaine", "titre", "titreCourt", "accroche", "couleur", "chapitres"):
        if not theme.get(champ):
            erreur(f"{ident}/theme.json : champ « {champ} » manquant")
    chapitres = [c.get("id") for c in theme.get("chapitres", [])]
    vus = set()
    total = 0
    for chapitre in theme.get("chapitres", []):
        cid = chapitre.get("id")
        for champ in ("id", "titre", "resume", "minutes"):
            if not chapitre.get(champ):
                erreur(f"{ident}/theme.json : chapitre « {cid} » sans « {champ} »")
        cours = dossier / "cours" / f"{cid}.html"
        if not cours.exists():
            erreur(f"{ident}/cours/{cid}.html : fichier manquant")
        else:
            analyse = Balises(f"{ident}/cours/{cid}.html")
            analyse.feed(cours.read_text(encoding="utf-8"))
            if analyse.pile:
                erreur(f"{ident}/cours/{cid}.html : balises non fermées : {analyse.pile}")
        questions = lire_json(dossier / "questions" / f"{cid}.json")
        if questions is None:
            continue
        if not questions:
            erreur(f"{ident}/questions/{cid}.json : aucune question")
        for q in questions:
            verifier_question(q, f"{ident}/questions/{cid}.json", vus)
        total += len(questions)
    glossaire = dossier / "glossaire.json"
    termes = lire_json(glossaire) if glossaire.exists() else []
    for terme in termes or []:
        if not terme.get("t") or not terme.get("d"):
            erreur(f"{ident}/glossaire.json : terme incomplet ({terme})")
        if terme.get("c") and terme["c"] not in chapitres:
            erreur(f"{ident}/glossaire.json : « {terme.get('t')} » renvoie à un chapitre inconnu « {terme['c']} »")
    print(f"  {ident} : {len(chapitres)} chapitres, {total} questions, {len(termes or [])} termes")


def main():
    index = lire_json(RACINE / "index.json")
    if index is not None:
        print("Thèmes :")
        for ident in index.get("themes", []):
            verifier_theme(ident)
    if erreurs:
        print(f"\n{len(erreurs)} problème(s) :")
        for e in erreurs:
            print(f"  - {e}")
        sys.exit(1)
    print("\nTout est cohérent.")


if __name__ == "__main__":
    main()
