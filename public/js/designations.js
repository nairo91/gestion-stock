(() => {
  const designationMap = {
    agencement: [
      "Data: 09-05-2025 / Oportunitate de referință: 0035 /Versiune: 3"
    ],
    cvc: [
      "Fib'Air A2 NETO / Fib'Air ALU A2",
      "AUSTRALE DIAM 125",
      "MANCHON PLACO AUSTRALE D125",
      "Gaine alu 125 en ML"
    ],
    conso: [
      "Réf. 1353492 VRAC CHEVILLES MÉTAL.Ø5X63+VISØ5X72 X238",
      "Réf. 1353471 VRAC CHEVILLES MÉTAL.Ø5X37+VISØ5X43 X315",
      "Réf. 1267742 Vis autoforeuse Diam. 3,5 x 9,5 mm Boîte de 500 - ISOLPRO",
      "Vis 4,0x30 PZ2",
      "Vis 4,5x45 PZ2",
      "Vis 5x50 PZ2",
      "Réf. 1339835 Cheville autoforeuse zamak driva + vis tête ronde Diam.4,5x35 mm x 100 - SPIT",
      "Réf. 1339226 Cheville arpon multi matériaux x Diam.6 x 25mm X 50 - SPIT",
      "Réf. 1338834 Cheville arpon multi matériaux x Diam.8 x 32mm X 50 - SPIT",
      "Réf. 940121 Gants de protection agilité T.9 - DELTA PLUS",
      "Réf. 811293 Gants de protection pour travaux de précision T.10 - KAPRION",
      "Réf. 1544641 FILM POLYETHYLENE 40µ 3X25M ONDULINE",
      "Réf. 10896011 Ruban adhésif toilé gris l.50 mm x L.50 m TESA",
      "Réf. 1493590 Ruban de masquage adhésif pour surfaces lisses l.50 mm x L.50 m - ROTA (lot de 6)",
      "Réf. 1569701 Ruban de masquage adhésif pour surfaces délicates l.36 mm x L.50 m - 3M (lot de 3)",
      "Réf. 10962560 Ruban de masquage de précision surface délicate l.25 mm x L.50 m - TESA",
      "Réf. 25014595 3M PT206036 Ruban de masquage pour peinture 3M™ 2060 vert clair (L x l) 50 m x 36 mm 1 pc(s)"
    ],
    menuiserie: [
      "Réf. 1221024 Bloc-porte isoplan prépeint Larg.63cm  Huiss72 mm",
      "ENSEMBLE BÉQUILLE DIANE SUR ROSACE BLANCHE AVEC ROSACE A CONDAMNATION",
      "Réf. 138033 Champlat  6 x 30 mm Long.2,4 m - SOTRINBOIS LOT DE 10",
      "Trappe de visite métallique Tempo Softline Ventil l 600X600 mm, ouverture clé carré, ral 9016",
      "Ferme-porte à pignon excentré et crémaillère GR 400 - GROOM FERMETURES",
      "Structure lit superposé"
    ],
    "menuiserie ext": [
      "OFFRE 1829/25"
    ],
    mobilier: [
      "Chaise Trill Nardi - Coloris TORTORA Fibre de verre",
      "RAIL 6010 IBIS STANDARD BLANC - L215",
      "TETE MICROFLEX PLIS SIMPLE (PMPS) NOCTURNE M1 UNI PERLE - L215xH249 1 pan"
    ],
    peinture: [
      "Réf. 1406160 Mastic de rebouchage Soudacryl FF acrylique blanc 300 ml - SOUDAL"
    ],
    platrerie: [
      "Réf. 334194 Rail métallique 48/28 mm Long.3 m NF - ISOLPRO",
      "Réf. 334180 Montant métallique 48/35 mm Long.2,50 m NF - ISOLPRO",
      "Plaque de plâtre BA13 standard NF H.250 x l.120 cm",
      "Plaque de plâtre BA13 hydrofuge NF H.250 x l.120 cm",
      "vis pour plaque de plâtre 3,5 x 25 mm boite 1000vis",
      "Lot de 8 panneaux laine de roche phonique rocksilence - Ep.40 mm lambda 34 R=1,35 L.120 x l.60 cm - ROCKWOOL",
      "Mortier adhésif en poudre 25 kg"
    ],
    sol: [
      "Bidon eco prim universel 20kg mapei 200gr/m²",
      "Ragréage P3 intérieur 25 kg - Planidur PRB 1,5 kg/m²/mm (base 2mm)",
      "Sarlibain Surestep 171032 smoke au m² (5.00 ROL 250.00M2)",
      "EUROFIX TACK PLUS 150gr/m²",
      "Forbo allura decibel 8WSM03 dune smooth oak au m² (268.00 CS)",
      "Plinthe FORBO PVC 6500 80mm 2ml/unité (27.00 CAR)",
      "Plinthe FORBO PVC BLANC 80mm 2ml/unité (9.00 CAR)",
      "Réf. 753851 Butoir de porte cylindre - CHAINEY",
      "Colle fixation plinthes - BOSTIK Réf. 850983",
      "SHOWTIME GRAPHIC IBIS REBOOST Référence 951273 Qualité A Format 200 CM5.00 ROL 400.00M2",
      "Textile aiguilleté couleur 900279 VS FORBO (remontées plinthes) Rouleau de 80m² (40x2m)",
      "LVT Allura 62513 Grigio Concrete 100x100cm FORBO",
      "Colle contact gel 4,25 kg - PATTEX"
    ],
    st: [
      "PEINTURES & SOLS",
      "ELEC - 4,5K/phase (x7)",
      "STICKAGE PORTE - D-202501-046"
    ],
    "stockage dechets": [
      "2 Conteneurs + 1 Algeco + Benne DIB & Bois"
    ],
    plomberie: [
      "Receveur Alterna Daily'O 120 x 80 cm ardoise blanc recoupable",
      "Kit de réparation receveurs Alterna Daily'O, Daily'C et Daily'L blanc",
      "Receveur de douche ALTERNA Daily'O 90x70cm blanc effet ardoise antidérapant",
      "Réf. 283724 CARREAU PLATRE HYDRO PLEIN 66X50X7",
      "Réf. 1236942 - Bonde douche extra-plate turboflow xs ø90 nicoll",
      "Union droit égal PER à sertir  D16",
      "Tube PER prégainé DUO D16mm ep 1,5mm couronne 50m (env 5ml/chambre)",
      "Té égal PER à sertir D16",
      "Réf. 652911 Raccord mâle M.12x17(3/8'') multicouche à sertir Diam.16 mm",
      "Réf. 92055431 Bouchon Laiton Femelle 12x17 (3/8) x2 bouchons NOYON & THIEBAULT",
      "Plaque de fixation pour raccord à sertir entraxe 150 PER ROBIFIX D16",
      "Grohtherm 500 douche avec ensemble Tempesta 110 1 jet 8l barre 600 Chromé Réf. 34808001",
      "SMART DESIGN P XXL SS 110 BLANC TRANSPARENTHT 2000X L 1100 MM (FIXE 450 + PVT 650 MM)",
      "SMART DESIGN P XXL SS 110 BLANC TRANSPARENTHT 2000X L 1100 MM (FIXE 400 + PVT 600 MM)",
      "Paroi d'angle 90(gauche)x70(droite)",
      "panneau en pvc cellulaire durci imprimé reboost carré écossais verni de  ( longueur receveur standard) 2200x1100x6mm",
      "panneau en pvc cellulaire durci imprimé reboost carré écossais verni de (largeur receveur standard + 90x70) 2200x700x6mm",
      "panneau en pvc cellulaire durci imprimé reboost carré écossais verni de  (longueur receveur 90x70) 2200x900x6mm",
      "Profilé PVC Angle/Plat L2350mm - BLANC",
      "Profilé cache chant parois 6mm long. 2,5m - BLANC laqué",
      "Panneau en pvc cellulaire durci imprimé reboost carré écossais verni ép 6mm de hauteur 2350mm x largeur 811mm (lavabo) 2200x800x6mm ?",
      "Panneau en pvc cellulaire durci imprimé reboost carré écossais verni ép 6mm de hauteur 1100mm x largeur 700mm (wc)",
      "COLLE Fixit blanc 290ml ou  Bostik MS 107 ou MSPOOL",
      "Tablette wc en pvc cellulaire durci 150x700mm",
      "Lavabo Geberit Acanto 500.620.01.2",
      "Réf. 1388590 Silicone sanitaire acétique translucide 280 ml",
      "Réf. 1401162 Silicone sanitaire acétique blanc 280 ml",
      "Mitigeur lavabo Eurosmart réf : 33265003",
      "Siphon à tube plongeur Geberit pour lavabo, sortie horizontale",
      "Distributeur papier rouleau simple White Serenity Référence:2321 00 00",
      "Patère simple Continental Référence:381 00 00",
      "Porte-papier de réserve Continental Référence:324 01 01",
      "Corbeille ovale polypropylène 6L Référence:240 00",
      "Pot balai court à poser Référence:274 00",
      "PACK BATI SUPPORT COMPLET Geberit + cuvette Renova Compact 203245000"
    ],
    electricité: [
      "INTERRUPTEUR A BADGE - CM0010 complet",
      "Interrupteur double Surface Céliane blanc compris : boite d'encastrement simple, support, interrupteur double, enjoliveur & plaque finition",
      "Interrupteur simple Surface Céliane blanc compris : boite d'encastrement, support, interrupteur, enjoliveur & plaque finition",
      "Prise + Inter VV Surface Céliane blanc compris : boite d'encastrement double, support double, prise 2P+T USB C intégré, inter VV, enjoliveurs, plaque finition double",
      "PC simple Surface Céliane blanc compris : boite d'encastrement, support, prise 2P+T, enjoliveur & plaque finition",
      "PC simple USB-C Surface Céliane blanc compris : boite d'encastrement, support, prise 2P+T USB C intégré, enjoliveur & plaque finition",
      "Prise 2x2P+T USB C intégré Surface Céliane blanc compris : boite d'encastrement double, support double, 2x prise 2x2P+T USB C intégré, enjoliveurs, plaque finition double",
      "Prise TV + PC Surface Céliane blanc compris : boite d'encastrement DOUBLE, support DOUBLE, prise 2P+T, prise tv, enjoliveurs, plaque finition double",
      "LISEUSE Applique radar 1 x LED 3 2 blanc mat 05-6488-14-14 LedC4",
      "Spot encastré blanc collerette blanche IP 65 30° 2700K",
      "Rail standard blanc (2 à 200cm) compris embout de rail, étrier de fixation au plafond et alimentation latérale en bout de rail. TARGETTI",
      "PROJECTEUR SUR RAIL LED SP 8W - 8W 23V diamètre 40 - 2700K - couleur BLANC TARGETTI",
      "L04 Spot isolé TARGETTI",
      "Hager - Goulotte de distribution lifea LFF 30x30mm 1 compartivement PVC Blanc - LFF3003009016 - 2ml",
      "Hager - Socle pour plinthe SL 20x80mm Noir - SL200801 - 2ml Hager - Couvercle pour plinthe SL 20x80mm Graphite Noir - SL2008029011 - 2ml",
      "Applique salle d'eau Sagara noir Mat ASTRO LIGHTING",
      "LUXA 103 S360-100-28 DE-UP WH",
      "LUXA 103 S360-100-12 DE-UP WH",
      "PROFIL NR LAZER L-R 2,01M",
      "DIFF. OPAL LZR L/LZR L-R 2,01M",
      "RUBAN 3M 2700K 720LM/M IP20",
      "ALIM 15W IP20 24VDC"
    ]
  };

  function initDesignationDropdown(catId, desigId, inputId) {
    const categorySelect = document.getElementById(catId);
    const designationSelect = document.getElementById(desigId);
    const designationInput = document.getElementById(inputId);

    function updateDesignations() {
      const cat = categorySelect.value.toLowerCase();
      const currentValue = designationInput ? designationInput.value : '';

      designationSelect.innerHTML = '<option value="">-- Sélectionner une désignation --</option>';

      if (designationMap[cat]) {
        designationMap[cat].forEach(d => {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          if (currentValue && currentValue === d) {
            opt.selected = true;
          }
          designationSelect.appendChild(opt);
        });

        // Si l'option existe, la valeur du select prévaut
        if (designationSelect.value) {
          if (designationInput) designationInput.value = designationSelect.value;
        }
      }
    }

    if (categorySelect) {
      categorySelect.addEventListener('change', updateDesignations);
      updateDesignations();
    }

    if (designationSelect && designationInput) {
      designationSelect.addEventListener('change', () => {
        designationInput.value = designationSelect.value;
      });
    }

    const form = designationSelect?.closest('form');
    if (form && designationInput) {
      form.addEventListener('submit', () => {
        if (designationSelect.value) {
          designationInput.value = designationSelect.value;
        }
      });
    }
  }

  window.initDesignationDropdown = initDesignationDropdown;
})();
