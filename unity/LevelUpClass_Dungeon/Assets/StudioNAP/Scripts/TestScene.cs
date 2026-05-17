using System.Collections;
using System.Collections.Generic;
using StudioNAP;
using UnityEngine;
namespace StudioNAP
{
    public class TestScene : MonoBehaviour
    {
        public GameObject _hitFont;
        public Transform Monster;
        // Start is called before the first frame update
        void Start()
        {

        }

        public void OnHitClick()
        {
            int firstNum = Random.Range(5555, 9999);
            int secondNum = Random.Range(5555, 9999);
            string strDamage = string.Format("{0}억 {1}만", firstNum, secondNum);
            Vector3 damagePos = Monster.position + new Vector3(0, 1, 0);

            // super simple
            SpriteFont.ShowDamage(strDamage, damagePos);

        }
    }

}